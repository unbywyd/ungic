const path = require('path');
const _ = require('underscore');
const getBuildConfig = require('./get_build_config');
const prompts = require('../../modules/prompt.js');
const fg = require('fast-glob');
const fse = require('fs-extra');
const fs = require('fs');

module.exports = async function(args, defaultConfig={}, overlayConfig={}) {
  let iconsPlugin = this.app.project.plugins.get('icons');

  let release = _.extend({
      version: args.version ? args.version : this.app.config.version,
      releaseName: args.release_name,
      configId: 'default',
      svgIcons: true,
      sprites: true
   }, defaultConfig, getBuildConfig.call(this, iconsPlugin, args.icons_build_name ? args.icons_build_name : args.release_name), overlayConfig);

   release.outputReleasePath = path.join(release.outputReleaseDir, release.releaseName + '-v' + release.version);

  let icons = iconsPlugin.collection;
  if(!icons.size()) {
    return this.logger.system(`This project has no icons.`, 'CLI', 'warning');
  }

  let hasSvg = icons.find(m => m.has('svg')), hasSprites = icons.find(m => !m.has('svg'));

  let response;
  if(!args.silently) {
    response = await prompts.call(this, [{
      type: 'confirm',
      name: 'reconfig',
      message: 'Do you want to configure ICONS release?',
      default: false
    }]);
  } else {
    response = {
      reconfig: false
    }
  }

  /*
  *   Хелпер для получения иконок по глобу
  */
  let getIconsByGlob = async (onlySvg, glob, silently) => {
    try {
      let entries = await fg(glob, {
        cwd: iconsPlugin.root
      });
      if (!entries.length) {
        if(!silently) {
          this.logger.system(`Search by ${glob} glob returned no results`, 'CLI', 'warning');
        }
        return
      } else {
        let pathes = _.map(entries, p => path.normalize(p));
        let foundIcons = icons.filter(m => {
          if (pathes.indexOf(path.normalize(m.get('path'))) != -1) {
            if (onlySvg && m.has('svg') || !onlySvg && !m.has('svg')) {
              return m;
            }
          }
        });
        if (!foundIcons.length) {
          let type = onlySvg ? 'svg icons' : 'sprites';
          if(!silently) {
            this.logger.warning(`No ${type} found by ${glob} glob pattern`, 'CLI');
          }
        } else {
          return foundIcons;
        }
      }
    } catch (e) {
      return this.logger.system(e, 'CLI');
    }
  }

  /*
  *   Хелпер для обработки значений по умолчанию
  */

  let getDefaultIcons = async (svgOnly) => {
    let key = svgOnly ? 'svgIcons' : 'sprites';
    let icons = iconsPlugin.getIconsList(svgOnly);
    if(!icons.length) {
      return icons;
    }
    let iconsList = _.pluck(icons, 'id');
    let iconsChoosed = release[key];
    if(iconsChoosed === '*' || iconsChoosed === true) {
      iconsChoosed = iconsList;
    } else if(typeof iconsChoosed == 'string') {
      let foundIcons = await getIconsByGlob(svgOnly, iconsChoosed, true);
      if(foundIcons && Array.isArray(foundIcons)) {
        iconsChoosed = _.pluck(foundIcons, 'id');
      }
    } else if(Array.isArray(iconsChoosed)) {
      iconsChoosed = _.filter(iconsChoosed, icon => {
        let exist = iconsList.includes(icon);
        if(!exist) {
          this.logger.system(`${icon} icon not exist in current project and will skiped. (You need to specify the IDs of the icons, not their names or paths)`, 'CLI', 'warning');
        }
        return exist;
      });
    }
    if(!Array.isArray(iconsChoosed)) {
      iconsChoosed = [];
    }
    return iconsChoosed;
  }

  
  let parseDefaultValues = async () => {

    if(release.sprites) {
      let _icons = await getDefaultIcons(false);
      if(!_icons.length) {
        release.sprites = false;
      } else {
        release.sprites = _icons;
      }
    }
    if(release.svgIcons) {
      let _icons = await getDefaultIcons(true);
      if(!_icons.length) {
        release.svgIcons = false;
      } else {
        release.svgIcons = _icons;
      }
    }
  }

  if(response && response.reconfig) {
    if(args.requestVersion) {
      response = await prompts.call(this, [{
        type: 'input',
        name: 'version',
        message: 'Version',
        default: release.version,
        validate: v => v.toString().replace(/\s+/, '') !== ''
      }]);
      if(response) {
        release.version = response.version;
      }
    }

    /*
    *   Хелпер получения иконок / спрайтов
    */
    let iconsRequest = async (svgOnly) => {
      let allIcons = iconsPlugin.getIconsList(svgOnly);
      let iconsList = _.pluck(allIcons, 'id');
      let storageName = svgOnly ? 'svgIcons' : 'sprites';
      let label = svgOnly ? 'SVG icons' : 'Image sprite';

      /*
      *   Подготавливаем список выбранных иконок
      */
      let iconsChoosed = await getDefaultIcons(svgOnly);
      //console.log('iconsChoosed', iconsChoosed);
      response = await prompts.call(this, [{
        type: 'confirm',
        name: 'response',
        message: `Generate ${label}?`,
        default: true
      }]);
      if(response && response.response) {
        response = await prompts.call(this, [{
          type: 'list',
          name: 'searchMethod',
          message: `Selection method of ${label}`,
          default: 'list',
          validate: v => v.replace(/\s+/, '') !== '',
          choices: [{
            value: 'glob',
            name: 'By glob pattern'
          }, {
            value: 'list',
            name: 'Choose from list'
          }]
        }]);
        let searchMethod = response ? response.searchMethod : 'list';
        if(searchMethod == 'list') {
          response = await prompts.call(this, [{
            type: 'checkbox',
            name: 'icons',
            validate: v => v.length ? true : false,
            message: `Choose ${svgOnly ? 'icons' : 'images'}`,
            choices: _.map(iconsList, icon => {
              return {
                value: icon,
                name: icon,
                checked: iconsChoosed.includes(icon)
              }
            })
          }]);
          if(response && response.icons.length) {
            release[storageName] = response.icons;
          } else {
            this.logger.system(`No ${svgOnly ? 'icons' : 'images'} provided, release for them will not be implemented.`, 'CLI', 'warning');
            release[storageName] = false;
          }
        } else {
          let defaultPattern = ('string' == typeof release[storageName] && release[storageName] != '*') ? release[storageName] : '**/*.' + (svgOnly ? 'svg' : 'png');
          response = await prompts.call(this, [{
            type: 'input',
            name: 'globPattern',
            message: `Enter a glob path relative to the source icons folder`,
            default: defaultPattern,
            validate: v => v.replace(/\s+/, '') !== ''
          }]);
          let globPattern = response ? response.globPattern : defaultPattern;
          if(!response) {
            this.logger.system('Glob pattern was not specified, the default pattern will be used: ' + defaultPattern, 'CLI', 'warning');
          }
          let foundIcons = await getIconsByGlob(svgOnly, globPattern);
          if(Array.isArray(foundIcons) && foundIcons.length) {
            release[storageName] = _.pluck(foundIcons, 'id');
          }
        }
      } else {
        release[storageName] = false;
      }
    }
    await parseDefaultValues();
    
    if(hasSvg) {
      if(!args.commonRelease) {
        await iconsRequest(true);
      } /*else {
        if((release.sprites && !Array.isArray(release.sprites)) || (release.svgIcons && !Array.isArray(release.svgIcons))) {
          await parseDefaultValues();
        }
      }*/
      if(release.svgIcons) {
        response = await prompts.call(this, [{
          type: 'list',
          name: 'mode',
          message: `SVG icons build mode`,
          default: release.svgIconsMode,
          validate: v => v.replace(/\s+/, '') !== '',
          choices: [
            {
              value: 'fonts',
              name: 'Fonts'
            },
            {
              value: 'svgSprite',
              name: 'SVG sprite'
            }]
        }]);
        if(response) {
          release.svgIconsMode = response.mode;
        }
      }
    }

    if(!args.commonRelease) {
      if(hasSprites) {
        await iconsRequest();
      }
    }

    if(!release.sprites && !release.svgIcons) {
      this.logger.system(`No resources provided (icons, images), icons release will not be implemented.`);
    }
  } else {
    await parseDefaultValues();
    if(!release.sprites && !release.svgIcons) {
      this.logger.system(`No resources provided (icons, images), icons release will not be implemented.`);
    }
  }
 	return release;
}