const path = require('path');
const _ = require('underscore');
const getBuildConfig = require('./get_build_config');
const prompts = require('../../modules/prompt.js');
module.exports = async function(args, defaultConfig={}) {
	let htmlPlugin = this.app.project.plugins.get('html');
	/*
	*		Назначаем конфигурацию по умолчанию
	*/
	let release = _.extend({
      pages: "*",
      excludePages: [],
      configId: "default"
   }, defaultConfig, getBuildConfig.call(this, htmlPlugin, args.html_build_name ? args.html_build_name : args.release_name));

   release.outputReleasePath = path.join(release.outputReleaseDir, release.releaseName + '-v' + release.version);


  let pages = htmlPlugin.collection.findAllWhere({ type: 'page' });
  if (!pages.length) {
    return this.logger.system(`This project has no pages.`, 'CLI', 'warning');
  }

  let allPages = _.map(pages, p => p.path), selectedPages = [], pagesToSelect = [];

  if(Array.isArray(release.pages) && release.pages.length) {
    selectedPages = _.filter(release.pages, page => {
      let exist = allPages.includes(page);
      if(!exist) {
        this.logger.warning(`${page} page not exist and will skipped`);
      }
      return exist;
    });
  } else if(release.pages == '*') {
    selectedPages = allPages;
  }

  let excludePages = [];
  if(release.excludePages && release.excludePages.length) {
    excludePages = _.filter(release.excludePages, page => allPages.includes(page));
  }

  let response;
  if(!args.silently) {
    response = await prompts.call(this, [{
      type: 'confirm',
      name: 'reconfig',
      message: 'Do you want to configure HTML release?',
      default: false
    }]);
  } else {
    response = {
      reconfig: false
    }
  }

  if(response && response.reconfig) {
    let htmlQuestions = [];
    let exclude = false;

    if(excludePages.length) {
      response = await prompts.call(this, [{
        type: 'confirm',
        name: 'response',
        message: 'Do you want to apply excludePages configuration and exclude the pages specified in it?',
        default: true
      }]);
      exclude = response && response.response;
    }

    let isChecked = page => {
      let selected =  selectedPages.includes(page);
      if(!selected) {
        return false;
      }
      if(excludePages.includes(page) && exclude) {
        return false;
      }
      return selected;
    }

    for(let page of allPages) {
      pagesToSelect.push({
        value: page,
        name: page,
        checked: isChecked(page),
        disabled: (excludePages.includes(page) && exclude)
      })
    }

    if(!_.find(pagesToSelect, page => !page.disabled)) {
      return this.logger.system('HTML pages for release were not provided', 'CLI', 'warning');
    }

    htmlQuestions.push({
      type: 'checkbox',
      name: 'pages',
      message: `Select pages to release`,
      validate: v => v.length ? true : false,
      choices: pagesToSelect
    });
    htmlQuestions.push({
      type: 'confirm',
      name: 'validation',
      message: `Do you want to validate html with w3 validator?`,
      default: !!(release.validation)
    });
    htmlQuestions.push({
      type: 'list',
      name: 'formatting',
      message: `Formatting style`,
      default: release.formatting,
      choices: [
        {
          value: false,
          name: 'Skip, do nothing'
        },
        {
          value: 'beautify',
          name: 'Beautify'
        },
        {
          value: 'minifier',
          name: 'Minifier'
        }
      ]
    });
    response = await prompts.call(this, htmlQuestions);
    if(!response || !response.pages.length) {
      return this.logger.system('HTML pages for release were not provided', 'CLI', 'warning');
    }

    release = _.extend(release, response);

    response = await prompts.call(this, [{
      type: 'confirm',
      name: 'response',
      message: `Do you want to configure actions associated with styles?`,
      default: false
    }]);

    if(response && response.response) {
      htmlQuestions = [];
      htmlQuestions.push({
        type: 'confirm',
        name: 'includeLocalStyles',
        message: `Include all local external styles to internal styles?`,
        default: !!(release.includeLocalStyles)
      });
      htmlQuestions.push({
        type: 'confirm',
        name: 'mergeInternalStyles',
        message: `Merge all internal stylesheets?`,
        default: !!(release.mergeInternalStyles)
      });
      htmlQuestions.push({
        type: 'confirm',
        name: 'optimizeInternalStyles',
        message: `Optimize internal stylesheets?`,
        default: !!(release.optimizeInternalStyles)
      });
      response = await prompts.call(this, htmlQuestions);
      if(response) {
        release = _.extend(release, response);
      }
    }

    response = await prompts.call(this, [{
      type: 'confirm',
      name: 'response',
      message: `Do you want to configure actions associated with scripts?`,
      default: false
    }]);

    if(response && response.response) {
      htmlQuestions = [];
      htmlQuestions.push({
        type: 'confirm',
        name: 'includeLocalScripts',
        message: `Include all local scripts to internal scripts?`,
        default: !!(release.includeLocalScripts)
      });
      htmlQuestions.push({
        type: 'confirm',
        name: 'internalScriptsToFooter',
        message: `Move all internal scripts to footer?`,
        default: !!(release.internalScriptsToFooter)
      });
      htmlQuestions.push({
        type: 'confirm',
        name: 'externalScriptsToFooter',
        message: `Move all external scripts to footer?`,
        default: !!(release.externalScriptsToFooter)
      });
      htmlQuestions.push({
        type: 'confirm',
        name: 'mergeInternalScripts',
        message: `Merge all internal scripts?`,
        default: !!(release.mergeInternalScripts)
      });
      htmlQuestions.push({
        type: 'confirm',
        name: 'optimizeInternalScripts',
        message: `Optimize internal scripts?`,
        default: !!(release.optimizeInternalScripts)
      });
      response = await prompts.call(this, htmlQuestions);
      if(response) {
        release = _.extend(release, response);
      }
    }
  } else {
    if(!selectedPages.length) {
      this.logger.system('HTML pages for release were not provided', 'CLI', 'warning');
    } else {
      let pagesToRelease = _.filter(selectedPages, page => !excludePages.includes(page));
      if(!pagesToRelease.length) {
        this.logger.system('HTML pages for release were not provided', 'CLI', 'warning');
      } else {
        release.pages = selectedPages;
      }
    }
  }
  if(!release.pages) {
    release.pages = [];
  }
 	return release;
}