const path = require('path');
const _ = require('underscore');
const getBuildConfig = require('./get_build_config');
const prompts = require('../../modules/prompt.js');
module.exports = async function(args, defaultConfig={}, overlayConfig={}) {
	let scssPlugin = this.app.project.plugins.get('scss');
	/*
	*		Назначаем конфигурацию по умолчанию
	*/
	let release = _.extend({
      version: args.version ? args.version : this.app.config.version,
      releaseName: args.release_name,
      configId: "default",
      defaultTheme: "default",
      themes: [],
      components: "*",
      excludeComponents: []
   }, defaultConfig, getBuildConfig.call(this, scssPlugin, args.scss_build_name ? args.scss_build_name : args.release_name, args.includeBuildConfig), overlayConfig);

   release.outputReleasePath = path.join(release.outputReleaseDir, release.releaseName + '-v' + release.version);


	let allScssComponents = await scssPlugin.getComponents(),
	  	selectedComponents = release.components;
	if (!allScssComponents.length) {
		this.logger.system('This project has no SCSS components', 'CLI');
		return
	}

  if(Array.isArray(selectedComponents) && selectedComponents.length) {
  	/*
  	*		Фильтруем на несуществующие компоненты
  	*/
    selectedComponents = _.filter(selectedComponents, cid => {
      let exist = allScssComponents.includes(cid);
      if(!exist) {
        this.logger.warning(`${cid} SCSS component not exist in current project and will skipped`);
      }
      return exist;
    });
  } else if (selectedComponents === '*') {
  	/*
  	*		Если звездочка, помечаем все компоненты как выбранные.
  	*/
    selectedComponents = allScssComponents;
    release.components = selectedComponents;
  }

  /*
  *		Фильтруем все исключения если они заданы.
  */
  let excludeComponents = [];
  if(release.excludeComponents && release.excludeComponents.length) {
    excludeComponents = _.filter(release.excludeComponents, cid => allScssComponents.includes(cid));
  }

  let themes = await scssPlugin.getThemes();

  
  /*
  *   Если в проекте нет темы по умолчанию прервать релиз
  */
  if(themes.includes(release.defaultTheme) == -1) {
    this.logger.system(`To create a CSS release, the default theme is required`, 'CLI', 'warning');
    return
  }

  if(themes.length > 1) {
  	/*
  	*		Если в проекте больше чем одна тема.
  	*/
    if(release.themes === '*') {
    	/*
    	*		Добавляем в выбранные темы все, кроме основной темы.
    	*/
      release.themes = _.reject(themes, t => t == release.defaultTheme);
    } else if(Array.isArray(release.themes)) {
    	/*
    	*		Отфильтровали темы, проверили все ли существуют.
    	*/
      let selectedThemes = _.filter(release.themes, theme => {
        let exist = themes.includes(theme);
        if(!exist) {
          this.logger.warning(`${theme} theme not exist in current project and will skipped`);
        }
        return exist;
      });
      /*
      *		Исключаем из списка тему по умолчанию.
      */
      release.themes = _.reject(selectedThemes, t => t == release.defaultTheme);
    }

    /*
    *   Если тем больше чем одна, и выбрана одна тема, то сгенерировать её исключительно.
    */
  }

  let response;
  if(!args.silently) {
    response = await prompts.call(this, [{
      type: 'confirm',
      name: 'reconfig',
      message: 'Do you want to configure CSS release?',
      default: false
    }]);
  } else {
    response = {
      reconfig: false
    }
  }

  /*
  *		Если требуется реконфигурация
  */
  if(response && response.reconfig) {
    let scssQuestions = [], exclude = false;
    /*
    *		Если в конфигуации указаны исключения, задать вопрос, учитывать ли их.
    */

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


    if(excludeComponents.length) {
      response = await prompts.call(this, [{
        type: 'confirm',
        name: 'response',
        message: 'Do you want to apply excludeComponents configuration and exclude the components specified in it?',
        default: true
      }]);
      exclude = response && response.response;
    }

    /*
    *		Проверяем компонент на выбранный пользователем для релиза.
    */
    let isChecked = cid => {
      let selected =  selectedComponents.includes(cid);
      if(!selected) {
        return false;
      }
      if(excludeComponents.includes(cid) && exclude) {
        return false;
      }
      return selected;
    }

    /*
    *		Подготавливаем объект данных с компонентами для выбора.
    */
    let componentsToSelect = [];

    for(let cid  of allScssComponents) {
      componentsToSelect.push({
        value: cid,
        name: cid,
        checked: isChecked(cid),
        disabled: (excludeComponents.includes(cid) && exclude)
      })
    }

    /*
    *		Если нет активных компонентов (все отключены), то возвращает ложь
    */
    if(!_.find(componentsToSelect, cid => !cid.disabled)) {
      this.logger.system('Scss components for release were not provided', 'CLI', 'warning');
      return
    } else {

      if(!args.commonRelease) {
      	/*
      	*		Выбор компонентов
      	*/
        scssQuestions.push({
          type: 'checkbox',
          name: 'components',
          message: `Components`,
          validate: v => v.length ? true : false,
          choices: componentsToSelect
        });

        response = await prompts.call(this, scssQuestions);

        /*
        *		Если выбор компонентов был отменен или компоненты небыли выбраны, отменяем релиз
        */
        if (!response || !response.components.length) {
          return this.logger.warning('SCSS components for release were not provided', 'CLI');
        }
        release = _.extend(release, response);
      }

      /*
      *		Предложить определиться с выбором тем
      */
      if(themes.length > 1) {
        response = await prompts.call(this, [{
          type: 'checkbox',
          name: 'themes',
          message: `Themes (select one or more)`,
          validate: v => v.length ? true : false,
          choices: _.map(themes, theme => {
            return {
              value: theme,
              checked: release.themes.includes(theme) || release.defaultTheme == theme
            }
          })
        }]);
        if(!response || !response.themes.length) {
          this.logger.system('No theme has been selected, the default theme will be used', 'CLI', 'warning');
        }
        if(response) {
          let defaultThemeSelected = _.find(response.themes, t => t == release.defaultTheme);
          let themesWithoutDefault = _.reject(response.themes, t => t == release.defaultTheme);
          release.themes = themesWithoutDefault;
          /*
          *		Если выбрана одна тема, перенести её в тему по умолчанию и пропустить следующий вопрос о выборе мода генерации темы.
          */
          if(response.themes.length) {
            if(response.themes.length == 1) {
              release.defaultTheme = response.themes.shift();
            } else {
              if(!defaultThemeSelected) {
                response = await prompts.call(this, [{
                  type: 'list',
                  name: 'defaultTheme',
                  message: `Default theme`,
                  validate: v => v.replace(/\s+/, '') !== '',
                  default: release.defaultTheme,
                  choices: [release.defaultTheme].concat(response.themes)
                }]);
                if(!response) {
                  release.defaultTheme = 'default';
                  this.logger.system('The default theme was not selected, a default theme will use as default theme', 'CLI', 'warning');
                } else {
                  release.defaultTheme = response.defaultTheme;
                  release.themes = _.reject(release.themes, t => t == release.defaultTheme);
                }
              }
              response = await prompts.call(this, [{
                type: 'list',
                name: 'themeMode',
                message: `Theme generation mode`,
                choices: ['external', 'combined'],
                default: release.themeMode
              }]);
              if(response) {
                release.themeMode = response.themeMode;
              }
            }
          }
        }
      }

      response = await prompts.call(this, [{
        type: 'confirm',
        name: 'inverse',
        message: `Generate inverse version?`,
        default: release.inverse
      }]);

      if(response) {
        release.inverse = response.inverse;
        if(response.inverse) {
          response = await prompts.call(this, [{
            type: 'confirm',
            name: 'defaultInverse',
            message: `Inverse theme by default?`,
            default: release.defaultInverse
          }]);
          if(response) {
            release.defaultInverse = response.defaultInverse;
          }
          response = await prompts.call(this, [{
            type: 'list',
            name: 'inverseMode',
            message: `Inverse generation mode`,
            choices: ['external', 'combined'],
            default: release.inverseMode
          }]);
          if(response) {
            release.inverseMode = response.inverseMode;
          }
        }
      }
      response = await prompts.call(this, [{
        type: 'list',
        name: 'direction',
          choices: [{
            value: false,
            name: 'Skip rtl plugin'
            }, {
              value: 'ltr',
              name: 'LTR by default'
            },
            {
              value: 'rtl',
              name: 'RTL by default'
            }],
          default: 'ltr'
      }]);
      if(response) {
        release.direction = response.direction;
        if(release.direction) {
          response = await prompts.call(this, [{
            type: 'confirm',
            name: 'oppositeDirection',
            message: `Opposite direction?`,
            default: release.oppositeDirection
          }]);
          if(response) {
            release.oppositeDirection = response.oppositeDirection;
          }
        }
      }

      response = await prompts.call(this, [{
        type: 'confirm',
        name: 'autoprefixer',
        message: `autoprefixer?`,
        default: release.autoprefixer
      }]);

      if(response) {
        release.autoprefixer = response.autoprefixer;
      }

    }
  } else {
    /*
    *   Если выбрана только одна тема, сделать её по умолчанию и не генерировать больше тем.
    */
    
    if(themes.length == 1) {
      release.defaultTheme = themes.shift();
      release.themes = _.reject(themes, t => t == release.defaultTheme);
    }

    /*
    *   Если выбранная тема по умолчанию не существует, заменить стандартной
    */
    if(!themes.includes(release.defaultTheme)) {
      this.logger.system(`${release.defaultTheme} theme not exist in current project, the default theme will be used`);
      release.defaultTheme = 'default';
    }

    /*
    *   Если нет выбранных компонентов вернуть ложь
    */
    if(!selectedComponents.length) {
      this.logger.system('Scss components for release were not provided', 'CLI', 'warning');
      return
    }
    let componentsToRelease = _.filter(selectedComponents, cid => !excludeComponents.includes(cid));
    if(!componentsToRelease.length) {
      this.logger.system('Scss components for release were not provided', 'CLI', 'warning');
      return
    } else {
      release.components = componentsToRelease;
    }
  }
 
 	return release;
}