const plugin = require('../');
const fg = require('fast-glob');
const hbs = require('handlebars');
const moment = require('moment');
const fs = require('fs');
const fsp = fs.promises;
const fse = require('fs-extra');
const _ = require('underscore');
const { promisify } = require("util");
fsp.exists = promisify(fs.exists);
const AppPaths = require('../../modules/app-paths');
let appPaths = AppPaths();
const path = require('path');
const skeleton = require('../../modules/skeleton');
const renderMaster = require('../../modules/render-master');
const watchGrouping = require('../../modules/watch-grouping');
const {extend: Collection} = require('../../modules/collection-sync');
const {extend: Model} = require('../../modules/model');
const sass = require("sass");
const Fiber = require("fibers");
const encodeFunction = require('../../modules/sass-json');
const postcss = require('postcss');
const clean = require('../../modules/postcss-clean');
const srcReplacer = require('../../modules/postcss-src-replacer');

const rtl = require('postcss-rtl');
const autoprefixer = require('autoprefixer');
const Storage = require('../../modules/storage');

class builder extends skeleton {
    constructor(scheme, config={}) {
        super(scheme, {objectMerge: true}, config);
    }
}

let componentsMethods = {
    reassignment: function(cid, done) {
        fsp.readFile(path.join(this.root, 'project', 'reassignment.scss'), 'UTF-8').then(content => {
            done({
                contents: content
            });
        });
    }
}

class scssPlugin extends plugin {
    constructor(config={}, sysconfig={}) {
        config.id = 'scss';
        super(require('./model-scheme'), config, sysconfig);
        this.framework = path.join(__dirname, 'framework');
        this.components = path.join(this.root, 'components');
        this.watchController = new watchGrouping;
        this.watchController.on('ready', events => {
            this.fileChanged(events);
        });
        this.depends = {};
        this.internalSassRules = new Storage;
        this.internalSassRulesRequired = new Storage;
        this.iconsSaveStorage = new Storage;
        let model = Model({
            oid: {
                type: 'string',
                required: true
            },
            cid: {
                type: 'string',
                required: true
            }
        }, {
            objectMerge: true
        });

        let collection = Collection(model);

        this.exports = new collection();
        this.exports.on('all', (event, model) => {
            if(event == 'updated' || event == 'add' || event == 'removed') {
                if(!this.activeRelease) {
                  this.emit('exports', event, model);
                }
            }
        });

        this.on('removed', cid => {
            let exps = this.exports.findAllWhere({cid});
            if(exps && exps.length) {
                this.exports.remove(exps);
            }
            this.depends[cid] = [];
        });
    }
    regComponentRouter(cid, url) {
        if(url != 'stdin') {
            let forCID = this.cidByPath(url);
            if(!this.depends[forCID]) {
                this.depends[forCID] = [];
            }
            if(this.depends[forCID].indexOf(cid) == -1) {
                this.depends[forCID].push(cid);
            }
        }
    }
    _importer(url, prev, done, context) {
        (async() => {
          try {
              let routes = require('./route');
              if(/^ungic\./.test(url)) {
                  if(routes[url]) {
                      let to = routes[url];
                      if(to.inline) {
                          let ph = path.join(this[to.root], to.path), contents = '';
                          if(fs.existsSync(ph)) {
                            contents = fs.readFileSync(ph, 'UTF-8');
                          } else {
                            this.log(`${url} module not exist`, 'warning');
                          }
                          done({
                            contents
                          });
                      } else {
                        done({
                            file: path.join(this[to.root], to.path)
                        });
                      }
                  } else {
                      if(/^ungic\.from-html/.test(url)) {
                          let lid = url.split('.')[2];
                          let cid = 'stdin';
                          if(prev != 'stdin') {
                              cid = this.cidByPath(prev);
                          }
                          if(url.split('.').length == 3) {
                              let allRulesByCID = _.filter(this.internalSassRules.storage, el => el.cid == cid);
                              this.internalSassRulesRequired.set({
                                  cid, lid
                              });
                              let rulesByLID = _.filter(allRulesByCID, el => el.lid == lid);
                              if(!rulesByLID) {
                                  this.log(`Attention! ${cid} component expects sass rules from html by ${lid} LID. Please note that styles will be included only after processing of html plugin!.`, 'warning');
                              } else {
                                  let rules = _.pluck(rulesByLID, 'rules').join(' ');
                                  return done({
                                      contents: rules
                                  });
                              }
                          } else {
                              this.log(`Warning while processing ${url} module in ${prev} file. To include sass styles for scss components from HTML plugin you need specify Load ID, example: sass.from-html.part1.`, 'warning');
                          }
                          return done({
                              contents: ''
                          });
                      }
                      if(/^ungic\.sprites/.test(url)) {
                          if(this.iconsStorage.sprite) {
                              let cid = 'stdin';
                              if(prev != 'stdin') {
                                  cid = this.cidByPath(prev);
                              }
                              return done({
                                  contents: `$cid:${cid}; ` + this.iconsStorage.sprite.data.sass
                              });

                          } else {
                            this.warning(`Warning while processing ${url} module in ${prev} file. To include sprite sass module, you need to activate "sprites" mode in the icons plugin.`);
                          }
                          return done({
                              contents: '@function exist() {@return false}'
                          });
                      }
                      if(/^ungic\.font-icons/.test(url)) {
                          if(this.iconsStorage.fonts) {
                              let cid = 'stdin';
                              if(prev != 'stdin') {
                                  cid = this.cidByPath(prev);
                              }
                              return done({
                                  contents: `$cid:${cid}; ` + this.iconsStorage.fonts.data.sass
                              });

                          } else {
                              this.warning(`Warning while processing ${url} module in ${prev} file. To include font-icons sass module, you need to activate "fonts" mode in the icons plugin and add to the project svg icons`);
                          }
                          return done({
                              contents: '@function exist() {@return false}'
                          });
                      }
                      if(/^ungic\.components/.test(url)) {
                          let parsed = url.split('.');
                          if(parsed.length == 2) {
                              return done({
                                  contents: '$cids: () !default;'
                              });
                          }
                          let cid = parsed[2];
                          this.regComponentRouter(cid, prev);
                          if(parsed.length == 3) {
                              if(!await fsp.exists(path.join(this.components, cid))) {
                                  this.error(`Error while processing ${url} module in ${prev} file. ${cid} component does not exist`);
                                  return done({
                                      contents: '@function exist() {@return false}'
                                  });
                              }
                              return done({
                                  file: path.join(this.components, cid)
                              });
                          } else {
                              let route = parsed.pop();
                              if(route == 'core') {
                                  route = '.core';
                              }

                              if(route == 'theme') {
                                  route = '.core/theme';
                              }

                              if(componentsMethods[route]) {
                                  return componentsMethods[route].call(this, cid, done);

                              } else if(await fsp.exists(path.join(this.components, cid, route)) || await fsp.exists(path.join(this.components, cid, route + '.scss'))) {
                                  return done({
                                      file: path.join(this.components, cid, route)
                                  });
                              } else {
                                  if(route == 'render') {
                                      this.warning(`Warning while processing ${url} module in ${prev} file. ${cid} component has no method for rendering`);
                                  } else {
                                      this.error(`Error while processing ${url} module in ${prev} file. ${route} handler not found for routing component`);
                                  }
                                  return done({
                                      contents: ''
                                  });
                              }
                          }
                      } else if(/^ungic\.themes/.test(url)) {
                          let splitted = url.split('.');
                          let theme = splitted[2];
                          return done({
                              file: path.join(this.root, 'project', 'themes', theme)
                          });
                      } else {
                          this.error(`Error while processing ${url} module in ${prev} file. ${url} route not exists`);
                          return done({
                              contents: ''
                          });
                      }
                  }
              } else {
                if(/^\@/.test(url)) {
                  if(!appPaths.node_modules) {
                    this.error('node_modules directory not found in current project');
                    this.system(`Are you trying to include ${url} from node_modules directory of current project, but this directory was not found in your project. You should install the required package into your project, please use npm install command.`, 'warning');
                    done({
                      contents: ''
                    });
                  } else {
                    let phToFile = path.join(appPaths.node_modules, url.replace('@', ''));
                    if(path.extname(phToFile) == '') {
                      phToFile = phToFile + '.scss';
                    }
                    let origin = phToFile;
                    if(!await fsp.exists(phToFile)) {
                      phToFile = path.join(path.dirname(phToFile), '_' + path.basename(phToFile));
                    }
                    if(await fsp.exists(phToFile)) {
                      done({
                        file: phToFile
                      });
                    } else {
                      this.error(origin + ' package not found in your project');
                      this.system(`Are you trying to include ${url} from node_modules directory of current project, but this package was not found in your project. You should install the required package into your project, please use npm install command.`, 'warning');
                      done({
                        contents: ''
                      });
                    }
                  }
                } else {
                  done();
                }
              }
          } catch(e) {
            let message = e.stack;
            this.error(`Error while processing ${url} module in ${prev} file. Sass compilation error: ${message}`);
            if(message.indexOf("NoSuchMethodError: method not found: 'call'") != -1) {
              this.error('Attempt to use an unknown "'+url+'" component. Error in '+ prev);
            }
            done({
              contents: ''
            });
          }
        })();
    }
    _sassRender(data, cids, config={}) {
        let exportsStorage = [];
        let functions = _.extend(encodeFunction, {
            "is-release()": () => {
                if(config.release) {
                    return sass.types.Boolean.TRUE
                } else {
                    return sass.types.Boolean.FALSE
                }
            },
            "to-export($cid, $oid, $data)":  (cid, oid, data) => {
                cid = cid.getValue();
                oid = oid.getValue();
                data = data.getValue();
                try {
                    data = JSON.parse(data);
                    exportsStorage.push({
                        oid, cid, data, id: cid + '.' + oid
                    });
                } catch(e) {
                    this.log(`${oid} exported option of ${cid} component has invalid json format.`, 'error');
                }
                return sass.types.Boolean.TRUE
            },
            "use-icon($cid, $icon_id)": (cid, icon_id) => {
                this.iconsSaveStorage.set({
                    cid: cid.getValue(),
                    icon_id: icon_id.getValue()
                });
                return sass.types.Boolean.TRUE
            }
        });
        let self = this;
        let renderConfig = _.extend({
          data,
          importer: function() {
                let args = [...arguments];
                args.push(this);
                self._importer.call(self, ...args);
          },
          outputStyle: "expanded",
          functions,
        }, config);

        if(process.env.NODE_ENV == 'development') {
            renderConfig.fiber = Fiber
        }
        if(this.activeRelease) {
          renderConfig.sourceMap = "string";
          renderConfig.sourceMapContents = true;
        }


        return new Promise(done => {
            sass.render(renderConfig, (err, result) => {
                if(err) {
                    this.error(err);
                    return done(false);
                }
                this.exports.add(exportsStorage);
                done(result);
            });
        });
    }
    async _postcss(data, buildConfig, release) {
        let config = this.config;
        let postcssTheme = require('../../modules/postcss-theme');
        let postcssThemeAfter = require('../../modules/postcss-theme-after');
        let postcssSplitter = require('../../modules/postcss-splitter');
        let plugins = [];
        if(buildConfig.autoprefixer) {
            plugins.push(autoprefixer);
        }
        let build = this.builder.config;
        let rtlOptions;
        if(buildConfig.direction) {
            if(buildConfig.direction == 'rtl' || buildConfig.oppositeDirection) {
                rtlOptions = {}
                if(buildConfig.direction == 'rtl' && buildConfig.oppositeDirection) {
                    rtlOptions.fromRTL = true;
                }
                if(!buildConfig.oppositeDirection) {
                    rtlOptions.onlyDirection = buildConfig.direction;
                }
            }
        }

        plugins.push(postcssTheme());

        if(release) {
          let releasePath = path.join(this.dist, 'releases', release.releaseName + '-v' + release.version, config.fs.dist.css);
          plugins.push(srcReplacer({
              release,
              dist: path.join(this.dist, config.fs.dist.css),
              distPath: releasePath
          }));
        }

        let events = [];

        if(rtlOptions) {
            if(config.rtlPrefix.prefixType) {
                rtlOptions.prefixType = config.rtlPrefix.prefixType;
            }
            if('string' == typeof config.rtlPrefix.prefix && config.rtlPrefix.prefix.length) {
                rtlOptions.prefix = config.rtlPrefix.prefix;
            }
            if(!(buildConfig.direction == 'ltr' && !buildConfig.oppositeDirection)) {
                plugins.push(rtl(rtlOptions));
            }
            //if(config.topSelector == 'html') {
                plugins.push(postcssThemeAfter());
            //}
        }

        let cleanscssMerging;

        if(config.cleancss) {
            let configCleanCss = typeof config.cleancss == 'object' ? config.cleancss : {};
            cleanscssMerging = _.extend({level: 2}, this.project.app.PLUGINS_SETTINGS.cleancss, configCleanCss);
        }

        if((buildConfig.themeMode == 'external' || buildConfig.inverseMode == 'external') && release) {
           events.push(new Promise(res => {
                plugins.push(postcssSplitter({
                    cleancss: cleanscssMerging,
                    inverse: buildConfig.inverseMode === 'external',
                    theme: buildConfig.themeMode === 'external',
                    callback: function(themes) {
                        res(themes);
                    }
                }));
            }))
        }


        if(cleanscssMerging) {
            if(release) {
                plugins.push(clean(cleanscssMerging));
            } else {
                plugins.push(clean({
                    level: 1
                }));
            }
        }

        events.push(new Promise(done => {
            postcss(plugins)
            .process(data, {from: undefined})
            .then(result => {
                done(result.css);
            }).catch(e => {
                console.log(e);
            });
        }));
        return Promise.all(events);
    }
    async _renderComponents(components, release) {
        let renderTemplate = path.join(this.framework, 'render.hbs.scss');
        renderTemplate = await fsp.readFile(renderTemplate, 'UTF-8');
        let config = this.config;
        let source = {components: await this.getComponents(), render: components, advancedExport: config.advancedExport};

        this.internalSassRulesRequired.clean(e => components.indexOf(e.cid) != -1);
        this.iconsSaveStorage.clean(e => components.indexOf(e.cid) != -1);
        let toRemove = this.exports.filter(exp => ['project'].concat(components).indexOf(exp.get('cid')) != -1);
        this.exports.remove(toRemove, {silent: true});
        let build = this.builder.config;
        let buildConfig = build.dev;
        if(!await fsp.exists(this.root, 'project', 'themes', source.theme) && !await fsp.exists(this.root, 'project', 'themes', source.theme + '.scss')) {
            this.error(`${source.theme} theme in the project does not exist`, {exit: true});
        }
        //source.topSelector = config.topSelector;

        if(!release) {
            source.theme = buildConfig.theme;
            let data = [];
            source.themePrefix = false;
            source.defaultTheme = true;
            source.defaultInverse = buildConfig.defaultInverse;
            let res = await this._sassRender(hbs.compile(renderTemplate)(source), components);
            if(res && res.css) {
                data.push(res.css);
                source.inverse = buildConfig.inverse;
                if(source.inverse) {
                  let response = await this._sassRender(hbs.compile(renderTemplate)(source), components);
                  data.push(response.css);
                }
            }
            if(data.length) {
                let result = await this._postcss(Buffer.concat(data), buildConfig);
                if(result.length === 1) {
                    result = result.shift();
                }
                let dir = '';
                if(!buildConfig.oppositeDirection) {
                    dir = '.' + buildConfig.direction;
                }
                await fse.outputFile(path.join(this.dist, config.fs.dist.css, components.join('-') + dir + '.css'), result);
                this.emit('ready', components);
                return true;
            }
        } else {
            let data = [];
            let releaseData = release;
            source.theme = releaseData.defaultTheme || "default";
            let themes = releaseData.themes ? releaseData.themes : [];
            source.themePrefix = false;
            source.defaultTheme = true;
            source.release = true;
            source.defaultInverse = releaseData.defaultInverse;
            if(!this.releaseResults) {
                this.releaseResults = [];
            }
            let dir = '';
            if(!releaseData.oppositeDirection) {
                dir = (releaseData.direction ? '.' + releaseData.direction : '');
            }
            let res = await this._sassRender(hbs.compile(renderTemplate)(source), components, {release});
            //await fse.outputFile(path.join(this.dist, 'test.scss'), res.css);

            if(res && res.css) {
                data.push(res.css);
                source.inverse = releaseData.inverse;

                let sourceURL = path.join(this.dist, 'releases', releaseData.releaseName + '-v' + releaseData.version, 'exports', (releaseData.filename ? releaseData.filename : releaseData.releaseName)  + dir + '.scss.map');
                await fse.outputFile(sourceURL, res.map.toString());

                if(source.inverse) {
                    try {
                      let response = await this._sassRender(hbs.compile(renderTemplate)(source), components, {release});
                      data.push(response.css);
                      sourceURL = path.join(this.dist, 'releases', releaseData.releaseName + '-v' + releaseData.version, 'exports', (releaseData.filename ? releaseData.filename : releaseData.releaseName)  + dir + '-inverse.scss.map');
                      await fse.outputFile(sourceURL, response.map.toString());
                    } catch(e) {
                      console.log(e);
                    }
                }

                if(themes.length) {
                    for(let theme of themes) {
                        source.defaultTheme = false;
                        source.themePrefix = (theme  == 'default') ? false : true;
                        source.inverse = false;
                        source.theme = theme;
                        try {
                          let response = await this._sassRender(hbs.compile(renderTemplate)(source), components, {release});
                          data.push(response.css);
                          sourceURL = path.join(this.dist, 'releases', releaseData.releaseName + '-v' + releaseData.version, 'exports', (releaseData.filename ? releaseData.filename : releaseData.releaseName)  + dir + '-theme-'+theme+'.scss.map');
                          await fse.outputFile(sourceURL, response.map.toString());
                        } catch(e) {
                          console.log(e);
                        }
                        source.inverse = releaseData.inverse;
                        if(source.inverse) {
                           try {
                            let response = await this._sassRender(hbs.compile(renderTemplate)(source), components, {release});
                            data.push(response.css);
                            sourceURL = path.join(this.dist, 'releases', releaseData.releaseName + '-v' + releaseData.version, 'exports', (releaseData.filename ? releaseData.filename : releaseData.releaseName)  + dir + '-theme-'+theme+'-inverse.scss.map');
                            await fse.outputFile(sourceURL, response.map.toString());
                          } catch(e) {
                            console.log(e);
                          }
                        }
                    }
                }

                let result = await this._postcss(Buffer.concat(data), releaseData, release);
                for(let r of result) {
                    if(typeof r == 'string') {
                        let output = await this.getReleseLabel(releaseData, r);
                        let url = path.join(config.fs.dist.css, 'v' + moment().unix() + '-' +  (releaseData.filename ? releaseData.filename : releaseData.releaseName)  + dir + '.css');
                        await fse.outputFile(path.join(this.dist, 'releases', releaseData.releaseName + '-v' + releaseData.version, url), output);
                        //console.log(output);
                        //console.log('outputFile', path.join(this.dist, 'releases', releaseData.releaseName + '-v' + releaseData.version, url));
                        this.releaseResults.push(url);
                    } else {
                        for(let e of r) {
                            if(e.root) {
                                let output = await this.getReleseLabel(releaseData, e.root);
                                let theme = e.theme ? e.theme : '';
                                try {
                                    let url = path.join(config.fs.dist.css, 'v' + moment().unix() + '-' +  (releaseData.filename ? releaseData.filename : releaseData.releaseName) + '.theme-' + theme + dir + '.css');
                                    await fse.outputFile(path.join(this.dist, 'releases', releaseData.releaseName + '-v' + releaseData.version, url), output);
                                    //console.log('outputFile', path.join(this.dist, 'releases', releaseData.releaseName + '-v' + releaseData.version, url));
                                    this.releaseResults.push(url);
                                } catch(e) {
                                    this.log(e, 'error');
                                }
                            }
                            if(e.inverse_root) {
                                let output = await this.getReleseLabel(releaseData, e.inverse_root);
                                let theme = e.theme;
                                try {
                                    let label = (theme == 'default') ? '' : '.theme-' + theme;
                                    let url = path.join(config.fs.dist.css, 'v' + moment().unix() + '-' + (releaseData.filename ? releaseData.filename : releaseData.releaseName) + label + '-inverse' + dir + '.css');
                                    await fse.outputFile(path.join(this.dist, 'releases', releaseData.releaseName + '-v' + releaseData.version, url), output);
                                    this.releaseResults.push(url);
                                } catch(e) {
                                  this.log(e, 'error');
                                }
                            }
                        }
                    }
                }
                this.emit('ready', components);
                return true;
            }
        }
    }
    async getReleseLabel(release, raw) {
      let template = await fsp.readFile(path.join(__dirname, 'release-label.hbs'), 'UTF-8');
      release = _.clone(release);
      for(let r in release) {
          if(Array.isArray(release[r])) {
              release[r] = release[r].join(', ');
          }
      }
      release.date = moment().format('DD.MM.YYYY, h:mm');
      let config = this.project.config;
      release.author = config.author;
      return hbs.compile(template)(release) + '\n' + raw;
    }
    async getThemes() {
      let themes = await fg('*.scss', {onlyFiles: true, cwd: path.join(this.root, 'project', 'themes')});
      return _.map(themes, t => path.basename(t, path.extname(t)));
    }
    async release(release) {
      let components = release.components;
      this.activeRelease = release;
      if(!components.length) {
          return this.error('At least one component is required to implement the release.', {exit: true});
      }
      let releasePath = path.join(this.dist, 'releases', release.releaseName + '-v' + release.version);

      try {
          await this._renderComponents(components, release);
          this.system(`${release.releaseName} release successfully generated to ${releasePath}`, true);
      } catch(e) {
          this.system(`${release.releaseName} release not generated.`, false);
          this.system(e, 'error');
      }
      let urls = this.releaseResults;
      delete this.releaseResults;
      delete this.activeRelease;
      return urls
    }
    async _render(events) {
        this.emit('render');
        let config = this.config;
        let prjConfig = this.project.config;
        for(let event of events) {
            try {
                await this._renderComponents(event.components);
            } catch(e) {
                console.log(e);
            }
            this.log(`Styles for ${event.components.join(',')} component(s) were successfully generated!`, 'success');
        }
        this.emit('rendered');
    }
    async initialize() {
        let config = this.config;
        appPaths = AppPaths();
        this.renderMaster = new renderMaster(_.extend(config.render, {
            id: this.id
        }), this._render.bind(this));

        this.renderMaster.on('log', (type, message) => {
            if(this.project.config.verbose) {
                this.log(message, type);
            }
        });
        this.on('watcher:'+ config.fs.dirs.source + ':' +config.fs.source.scss, (event, ph, stat) => {
            if(path.extname(ph) == '.scss') {
                this.watchController.emit('bind', event, ph);
            }
        });

        this.on('ready', async() => {
            let toPath = path.join(this.dist, 'exports', 'sass-options.json');

            if(this.activeRelease) {
                toPath = path.join(this.dist, 'releases', this.activeRelease.releaseName + '-v' + this.activeRelease.version, 'exports', 'sass-options.json');
                delete this.activeRelease;
            }

            await fse.outputFile(toPath, JSON.stringify(this.exports.toJSON(), null, 4));
        });

        let components = await this.getComponents();
        if(components.length) {
            for(let cid of components) {
                this.renderMaster.add({
                    description: `${cid} component`,
                    components: [cid]
                });
            }
        }

        if(!await fsp.exists(path.join(this.root, 'project'))) {
            await fse.copy(path.join(this.framework, 'project'), path.join(this.root, 'project'));
            await fse.outputFile(path.join(this.root, 'README.txt'), 'If you are just starting to work with Ungic then to get started, you should open the following files:\n * project/config.scss\n * project/properties.scss\n * project/reassignment.scss \n and read the comments at the beginning of the files.\n\nNote! In order to start writing your own styles, you need to create components!\nYou need to run the ungic project (> ungic run) and go to the scss plugin menu (> scss), use the "create <cid>" command to create a new component!\nAfter that, study the files that will appear in the components directory! Good luck!');
        }

        if(this.project.config.build.plugins[this.id]) {
            try {
                this.builder = new builder(require('./build.model-scheme'), this.project.config.build.plugins[this.id]);
            } catch(e) {
                return this.system('SCSS build scheme incorrect. Origin: \n' + e.message, 'error', {exit: true});
            }
        }
    }
    async fileChanged(events) {
        let components = [];
        let component_phs = [];
        for(let event in events) {
            if(_.find(events[event], e => e.dirname.indexOf(this.components) == -1)) {
                components = await this.getComponents();
                break
            }
            for(let ev of events[event]) {
                let cid = this.cidByPath(ev.dirname);
                component_phs.push({
                    cid, path: ev.path
                })
                if(components.indexOf(cid) == -1) {
                    if(await fsp.exists(path.join(this.components, cid))) {
                        components.push(cid);
                    }
                }
            }
        }

        if(components.length) {
            for(let cid of components) {
                let deps = this.getDepsFor(cid);
                if(deps.length) {
                    for(let dep of deps) {
                        if(components.indexOf(dep) == -1 && _.find(component_phs, e => (e.cid == cid && path.basename(path.relative(path.join(this.components, e.cid), e.path), path.extname(e.path)) != 'render' && path.dirname(path.relative(path.join(this.components, e.cid), e.path)) != 'render'))) {
                            if(this.project.config.verbose) {
                                this.log(`${dep} component depends on ${cid} component, so ${dep} component will be be reassembled.`, 'log');
                            }
                            components.push(dep);
                        }
                    }
                }
                this.renderMaster.add({
                    description: `${cid} component`,
                    components: [cid]
                });
            }
        }
    }
    async begin(options) {
        if(options.icons) {
            this.iconsStorage = options.icons;
        }
        this.project.on('icons', e => {
            if(!e.data && this.iconsStorage[e.type]) {
                delete this.iconsStorage[e.type];
                return
            }
            this.iconsStorage[e.type] = e;
        });
        try {
            await this.renderMaster.run();
        } catch(e) {
            console.log(e);
        }
        let status = this.renderMaster.status();
        if(status.clean) {
            this.emit('rendered', true);
        }
        this.emit('begined', true);
    }
    cidByPath(ph) {
        let cid = path.dirname(path.relative(this.components, ph)).split(path.sep).shift();
        if(cid == '.') {
            return path.basename(path.relative(this.components, ph)).split(path.sep).shift();
        }
        return cid;
    }
    cleanHtmlInternalSass(htmlModelId) {
        this.internalSassRules.clean(e => e.htmlModelId == htmlModelId);
    }
    setHtmlInternalSass(data) {
        for (let d of data) {
            this.internalSassRules.set(d);
        }
        // Group by CID
        let cidsToRebuild = _.uniq(_.pluck(data, 'cid'));

        // Получить все требуемые части для одного из компонентов
        let lidsWithCids = _.filter(this.internalSassRulesRequired.storage, el => cidsToRebuild.indexOf(el.cid) != -1);


        if(lidsWithCids.length) {
            // Отфильтровать до используемых лидов
            let cids = _.uniq(_.pluck(_.filter(lidsWithCids, c => _.find(data, d => d.lid == c.lid && d.cid == c.cid)), 'cid'));

            this.renderMaster.add({
                description: `${cids.join(', ')} components`,
                components: cids
            });
            if(cids.length > 1) {
                let config = this.config;
                let buildConfig = this.builder.config.dev.config;
                let dir = '';
                if(!buildConfig.oppositeDirection) {
                    dir = '.' + buildConfig.direction;
                }
                return path.join(config.fs.dist.css, cids.join('-')  + dir + '.css').replace(/\\+/g, '/');
            }
        }
    }
    getComponents() {
        return fg('**', {dot: false, onlyDirectories: true, cwd: this.components, deep: 1});
    }
    async createComponent(cid) {
        let toPath = path.join(this.components, cid);
        if(await fsp.exists(toPath)) {
            throw new Error(`${cid} component already exists`);
        }
        let watched = this.unwatched;
        this.unwatch();
        await fse.copy(path.join(this.framework, 'component'), toPath);
        this.emit('added', cid);
        if(!watched) {
            this.watch();
        }
        this.renderMaster.add({
            description: `${cid} component`,
            components: [cid]
        });
    }
    getDepsFor(cid) {
        let deps = [];
        for(let compID in this.depends) {
            if(this.depends[compID].indexOf(cid) != -1) {
                deps.push(compID);
            }
        }
        return _.uniq(deps);
    }
    async removeComponent(cid) {
        let toPath = path.join(this.components, cid);
        if(await fsp.exists(toPath)) {
            let deps = this.getDepsFor(cid);
            if(deps.length) {
                throw new Error(`"${deps.join(', ')}" components depend on this component.`);
            }
            let watched = this.unwatched;
            this.unwatch();
            await fse.remove(toPath);
            this.emit('removed', cid);
            if(!watched) {
                this.watch();
            }
        } else {
            throw new Error(`${cid} component not exists`);
        }
    }
}

module.exports = scssPlugin;