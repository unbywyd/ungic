const path = require('path');
const fg = require('fast-glob');
const fse = require('fs-extra');
const fs = require('fs');
const _ = require('underscore');
const { extend: Model } = require('../../modules/model');
const prompts = require('../../modules/prompt.js');
const scssInquirer = require('./scss_inquirer');
const htmlInquirer = require('./html_inquirer');
const iconsInquirer = require('./icons_inquirer');
const archiver = require('archiver');
const moment = require('moment');

module.exports = async function (args) {
  let scssPlugin = this.app.project.plugins.get('scss');
  let htmlPlugin = this.app.project.plugins.get('html');
  let iconsPlugin = this.app.project.plugins.get('icons');

  let buildConfig = this.app.config.build.releases.default;
  let buildName = args.build_name || args.release_name;
  if (this.app.config.build.releases[buildName]) {
    buildConfig = _.extend({}, buildConfig, this.app.config.build.releases[buildName]);
  }


  let release = _.extend({
    version: args.version ? args.version : this.app.config.version,
    releaseName: args.release_name
  }, args);

  args.scss_build_name = buildConfig.scssBuildName;
  args.html_build_name = buildConfig.htmlBuildName;
  args.icons_build_name = buildConfig.iconsBuildName;

  let pages = htmlPlugin.collection.findAllWhere({ type: 'page' });
  if (!pages.length) {
    return this.logger.system(`This project has no pages.`, 'CLI', 'warning');
  }

  let response = {
    reconfig: false
  }
  if (!args.silent) {
    response = await prompts.call(this, [{
      type: 'confirm',
      name: 'reconfig',
      message: 'Do you want to configure release?',
      default: false
    }]);

    if (!response) {
      return this.logger.system(`The action was canceled`, 'CLI');
    }
  }


  let reconfig = response && response.reconfig;
  args.silently = reconfig === false;

  // если включать только то, что используется
  if (buildConfig.includeOnlyUsedComponents) {
    args.commonRelease = true;
  }

  if (reconfig) {
    response = await prompts.call(this, [{
      type: 'input',
      name: 'version',
      message: 'Version',
      default: release.version,
      validate: v => v.toString().replace(/\s+/, '') !== ''
    },
    {
      type: 'string',
      name: 'host',
      message: `Host (resources relative to hostname, use / to make paths relative to the project, empty value, does not affect paths`,
      default: buildConfig.host ? buildConfig.host : ''
    }]);
    if (response) {
      release.version = response.version;
      buildConfig.host = response.host;
    } else {
      return this.logger.system(`The action was canceled`, 'CLI');
    }
  }

  let releaseDist = path.join(this.app.project.dist, (buildConfig.outputPathRelativeDist || './releases/'), release.releaseName + '-v' + release.version);

  await fse.emptyDir(releaseDist);

  let htmlRelease = await htmlInquirer.call(this, args, release);

  htmlRelease.urlsOptimization = buildConfig.urlsOptimization;
  htmlRelease.host = buildConfig.host;
  htmlRelease.noConflict = buildConfig.noConflict;

  if ('object' == typeof htmlRelease) {
    let pagesChosen = htmlRelease.pages, scssComponents = [], commonIcons = [], releaseByPage = {}, commonSvgIcons = [], commonSpritesIcons = [];

    for (let pagePath of pagesChosen) {
      let releaseData = Object.assign({}, _.omit(htmlRelease, 'pages', 'excludePages'));

      let data = await htmlPlugin.getReleaseInfo(_.find(pages, page => page.path == pagePath));

      let pageIcons = data.icons && data.icons.length ? data.icons : [];
      if (pageIcons.length) {
        let icons_ids = _.pluck(pageIcons, 'icon_id');
        releaseData.icons_ids = icons_ids;
        commonIcons = _.uniq(commonIcons.concat(icons_ids));
      }

      if (data.pipes && data.pipes.length) {
        let iconsSassUsed = scssPlugin.iconsSaveStorage.storage;
        let icons = [];
        releaseData.pipes = data.pipes;
        for (let cid of data.pipes) {
          let res = _.filter(iconsSassUsed, icon => {
            return icon.cid == cid
          });
          if (res) {
            icons = icons.concat(res);
          }
        }
        if (icons.length) {
          let icons_ids = _.uniq(_.pluck(icons, 'icon_id').concat(releaseData.icons_ids || []));
          releaseData.icons_ids = icons_ids;
          commonIcons = _.uniq(commonIcons.concat(icons_ids));
        }
        scssComponents = _.uniq(scssComponents.concat(data.pipes));
      }
      releaseByPage[pagePath] = releaseData;
    }
    if (commonIcons.length) {
      for (let id of commonIcons) {
        let icon = iconsPlugin.collection.get(id);
        if (icon && icon.has('svg')) {
          commonSvgIcons.push(id);
        } else {
          commonSpritesIcons.push(id);
        }
      }
    }

    let generateScssRelease = true
    if (scssComponents.length && reconfig && buildConfig.includeOnlyUsedComponents) {
      response = await prompts.call(this, [{
        type: 'confirm',
        name: 'scss',
        message: 'Selected pages contain scss components, do you want to generate CSS release with them?',
        default: true
      }]);
      if (response) {
        generateScssRelease = response.scss;
      }
    }

    // тут надо сбилдить иконки

    // ICONS -----------------------------
    let generateIconsRelease = true;
    if (commonIcons.length && reconfig && buildConfig.includeOnlyUsedComponents) {
      response = await prompts.call(this, [{
        type: 'confirm',
        name: 'icons',
        message: 'Selected pages contain icons, do you want to generate ICONS release with them?',
        default: true
      }]);
      if (response) {
        generateIconsRelease = response.icons;
      }
    }

    let iconsRelease;
    if (generateIconsRelease) {
      if (!buildConfig.includeOnlyUsedComponents) {
        iconsRelease = await iconsInquirer.call(this, args, release);
        if (iconsRelease) {
          let allIcons = [];
          if (Array.isArray(iconsRelease.svgIcons) && iconsRelease.svgIcons.length) {
            allIcons = iconsRelease.svgIcons;
          }
          if (Array.isArray(iconsRelease.sprites) && iconsRelease.sprites.length) {
            allIcons = allIcons.concat(iconsRelease.sprites);
          }
          commonIcons = allIcons;
        }
      } else if (commonIcons.length) {
        iconsRelease = await iconsInquirer.call(this, args, release, {
          svgIcons: commonSvgIcons.length ? commonSvgIcons : false,
          sprites: commonSpritesIcons.length ? commonSpritesIcons : false
        });
      }
    }
    let originSvgIconsMode = iconsPlugin.buildConfig.svgIconsMode;
    let combineIcons = buildConfig.combineIcons;

    if (reconfig && iconsRelease && pagesChosen.length > 1) {
      response = await prompts.call(this, [{
        type: 'confirm',
        name: 'combineIcons',
        message: 'Do you want to combine all the icons of each page into one release?',
        default: combineIcons
      }]);
      if (response) {
        combineIcons = response.combineIcons;
      }
    }

    if (iconsRelease) {
      iconsRelease.host = buildConfig.host;
      iconsRelease.includeLocalStyles = htmlRelease.includeLocalStyles;
      iconsRelease.urlsOptimization = buildConfig.urlsOptimization;
      iconsRelease.noConflict = buildConfig.noConflict;
    }


    // Begin of SASS release
    // Заполнение scssRelease
    let scssRelease;
    if (generateScssRelease) {
      if (!buildConfig.includeOnlyUsedComponents) {
        scssRelease = await scssInquirer.call(this, args, release);
      } else if (scssComponents.length) {
        scssRelease = await scssInquirer.call(this, args, release, {
          components: scssComponents,
          excludeComponents: []
        });
        if (typeof scssRelease != 'object') {
          this.logger.system(`CSS release was not implemented`);
        }
      }
    }

    let combineScssComponents = buildConfig.combineScssComponents;
    // Конфигурация combineScssComponents
    // Если требуется настроить и есть SASS релиз и имеются страницы
    if (reconfig && scssRelease && pagesChosen.length > 1) {
      response = await prompts.call(this, [{
        type: 'confirm',
        name: 'combineScssComponents',
        message: 'Do you want to combine all the scss components of each page into one release? (Into a single .css file)',
        default: combineScssComponents
      }]);
      if (response) {
        combineScssComponents = response.combineScssComponents;
      }
    }


    // Иконки для страниц по отдельности
    /**
     * Прогоняем releaseByPage
     * Требуется: combineScssComponents, combineIcons, scssRelease, scssReleasesByPage
     */

    let scssReleasesByPage = {};

    if (pagesChosen.length > 1) {
      for (let page in releaseByPage) {
        let data = releaseByPage[page];
        let pageName = (page.replace(path.extname(page), '').replace(/[\/\\]+/g, '-')).trim();
        let filename = pageName.toLowerCase() == 'index' ? scssRelease.releaseName : scssRelease.releaseName + '-' + pageName;

        if (!combineScssComponents) {
          if (Array.isArray(data.pipes) && data.pipes.length && scssRelease) {
            try {
              let release = await scssPlugin.release(_.extend({}, scssRelease, { components: data.pipes, filename }));
              scssReleasesByPage[page] = release;
              this.logger.system(`${filename}.css successfully generated for the ${page} page.`);
            } catch (e) {
              this.logger.system(`CSS release completed with an error: ${e.message}`, 'CLI', 'error');
            }
          }
        }
        if (!combineIcons && page != 'ungic-icons.html') {
          if (Array.isArray(data.icons_ids) && data.icons_ids.length && iconsRelease) {
            let svgIcons = _.filter(data.icons_ids, id => iconsPlugin.collection.get(id).has('svg'));
            let sprites = _.reject(data.icons_ids, id => iconsPlugin.collection.get(id).has('svg'));
            try {
              let release = await iconsPlugin.release(_.extend({}, iconsRelease, {
                svgIcons,
                sprites,
                filename
              }));
              data.iconsReleases = release.releases;
              this.logger.system(`Icons have been generated`);
            } catch (e) {
              this.logger.system(`ICONS release completed with an error: ${e.message}`, 'CLI', 'error');
            }
          }
        }
      }
    }

    let commonIconsRelease;
    if (commonIcons.length && iconsRelease) {
      let svgIcons = _.filter(commonIcons, id => iconsPlugin.collection.get(id).has('svg'));
      let sprites = _.reject(commonIcons, id => iconsPlugin.collection.get(id).has('svg'));

      try {
        commonIconsRelease = await iconsPlugin.release(_.extend({ combineIcons }, iconsRelease, {
          svgIcons,
          sprites
        }));
        //console.log(commonIconsRelease);
        this.logger.system(`Icons have been generated`);
      } catch (e) {
        this.logger.system(`ICONS release completed with an error: ${e.message}`, 'CLI', 'error');
      }
    }
    let prevIconsScssPlugins = scssPlugin.iconsStorage;
    scssPlugin.iconsStorage = {};
    if (commonIconsRelease?.releases) {
      for (let item of commonIconsRelease.releases) {
        scssPlugin.iconsStorage[item.type] = item;
      }
    }
    // END ICONS --------------------------------------------------



    this.logger.system(`Release build start, please wait...`);


    // Вот тут надо тупо скопировать все файлы в дист
    if (buildConfig.saveAllAssets) {
      if (await fse.pathExists(this.app.project.assets)) {
        this.logger.system(`Start copying assets files...`);
        await fse.copy(this.app.project.assets, releaseDist);
        this.logger.system(`Assets files copied successfully`);
      }
    }

    let commonScssRelease;

    // Общий релиз для стилей

    if (scssRelease) {
      scssRelease.host = buildConfig.host;
      scssRelease.includeLocalStyles = htmlRelease.includeLocalStyles;
      scssRelease.urlsOptimization = buildConfig.urlsOptimization;
      scssRelease.noConflict = buildConfig.noConflict;
      try {
        commonScssRelease = await scssPlugin.release(_.extend({}, scssRelease));
        this.logger.system(`Common styles have been generated`);
      } catch (e) {
        this.logger.system(`CSS release completed with an error: ${e.message}`, 'CLI', 'error');
      }
    }

    scssPlugin.iconsStorage = prevIconsScssPlugins;

    for (let page in releaseByPage) {
      try {
        let release = releaseByPage[page];

        if ((combineIcons && commonIconsRelease) || (commonIconsRelease && pagesChosen.length == 1)) {
          release.iconsReleases = commonIconsRelease.releases;
        }

        if ((combineScssComponents && commonScssRelease) || (commonScssRelease && pagesChosen.length == 1)) {
          release.scssURLS = commonScssRelease;
        } else if (scssReleasesByPage[page]) {
          release.scssURLS = scssReleasesByPage[page];
        }
        release.page = _.find(pages, p => p.path == page);
        if (release.page.body) {
          delete release.page.body;
        }
        if (iconsRelease) {
          iconsPlugin.buildConfig.svgIconsMode = iconsRelease.svgIconsMode;
        }
        await htmlPlugin.toRelease(release);
        if (iconsRelease) {
          iconsPlugin.buildConfig.svgIconsMode = originSvgIconsMode;
        }
      } catch (e) {
        this.logger.system(e, 'CLI');
      }
    }
    if (buildConfig.archive) {
      let tempPath = path.join(this.app.project.dist, (buildConfig.outputPathRelativeDist || './releases/'), release.releaseName + '-v' + release.version + '.zip');
      await new Promise((res, rej) => {
        const output = fs.createWriteStream(tempPath);
        const archive = archiver('zip', {
          zlib: { level: 5 }
        });
        output.on('close', async () => {
          try {
            await fse.copy(tempPath, path.join(releaseDist, release.releaseName + '-v' + release.version + '.zip'));
            await fse.remove(tempPath);
          } catch (e) {
            console.log(e);
          }
          res();
        });
        archive.pipe(output);
        archive.directory(releaseDist, false);
        archive.directory(this.app.project.sourceDir, 'source');
        archive.append(Buffer.from(`
  /*******************************************
  *  This release generated using ungic.
  ********************************************/
    Release name: ${release.releaseName}
    Release version: ${release.version}
    Release date: ${moment().format('DD.MM.YYYY, h:mm')}
    Project name: ${this.app.config.name}
    Project version: ${this.app.config.version}
    Author: ${this.app.config.author}`), { name: 'README.txt' });
        archive.finalize();
      });
    }
    this.logger.system(`${release.releaseName} release successfully generated to ${releaseDist}`, 'CLI', 'success');
  }
}