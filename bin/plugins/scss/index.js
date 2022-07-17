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
const { extend: Collection } = require('../../modules/collection-sync');
const { extend: Model } = require('../../modules/model');
const sass = require("sass");
//const Fiber = require("fibers");
const encodeFunction = require('../../modules/sass-json');
const postcss = require('postcss');
const clean = require('../../modules/postcss-clean');
const srcReplacer = require('../../modules/postcss-src-replacer');
const rgbcolor = require('rgb-color');
const rtl = require('postcss-rtl');
const autoprefixer = require('autoprefixer');
const Storage = require('../../modules/storage');
const {urlJoin} = require('../../modules/url-join');


class builder extends skeleton {
    constructor(scheme, config = {}) {
        super(scheme, { objectMerge: true }, config);
    }
}

let componentsMethods = {
    properties_over: async function(cid, done) {
        let exist = await fsp.exists(path.join(this.root, 'project', 'properties-over.scss'));
        if (exist) {
            fsp.readFile(path.join(this.root, 'project', 'properties-over.scss'), 'UTF-8').then(content => {
                done({
                    contents: content
                });
            });
        } else {
            done({
                contents: `$cid: null !default; $properties: () !default;`
            });
        }
    },
    config_over: async function(cid, done) {
        let exist = await fsp.exists(path.join(this.root, 'project', 'config-over.scss'));
        if (exist) {
            fsp.readFile(path.join(this.root, 'project', 'config-over.scss'), 'UTF-8').then(content => {
                done({
                    contents: content
                });
            });
        } else {
            done({
                contents: `$cid: null !default; $config: () !default;`
            });
        }
    }
}

class scssPlugin extends plugin {
    constructor(config = {}, sysconfig = {}) {
        config.id = 'scss';
        super(require('./model-scheme'), config, sysconfig);
        this.framework = path.join(__dirname, 'framework');
        this.components = path.join(this.root, 'components');
        this.watchController = new watchGrouping({timeOutDefault: 100});
        this.watchController.on('ready', events => {            
            this.fileChanged(events);
        });
        this.on("rendered", () => {
            this.ready = true;
        });
        //this.depends = {};
        this.internalSassRules = new Storage;
        this.internalSassRulesRequired = new Storage;
        this.iconsSaveStorage = new Storage;
        this.colorsVars = new Storage;
        this.componentsDepends = new Storage;
        this.individualComponentParams = new Storage;
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
            if (event == 'updated' || event == 'add' || event == 'removed') {
                if (!this.activeRelease) {
                    this.emit('exports', event, model);
                }
            }
        });

        this.on('removed', cid => {
            let exps = this.exports.findAllWhere({ cid });
            if (exps && exps.length) {
                this.exports.remove(exps);
            }
        });
    }
    getDepsFor(cid) {
        let deps = _.filter(this.componentsDepends.storage, s => s.usedCID == cid);
        return _.uniq(_.pluck(deps, 'cid'));
    }
    regComponentRouter(url, cid) {
        //this.componentsDepends
        if (path.isAbsolute(url)) {
            let forCID = this.cidByPath(url);
            this.componentsDepends.set({
                cid: forCID, // Данный компонент
                usedCID: cid // включает данный компонент
            });
            /*if(!this.depends[forCID]) {
                this.depends[forCID] = [];
            }
            if(this.depends[forCID].indexOf(cid) == -1) {
                this.depends[forCID].push(cid);
            }*/
        }
    }
    _importer(url, prev, done, context) {
        //console.log(url, prev);
        (async() => {
            try {
                let routes = require('./route');                
                if (/^ungic\./.test(url)) {
                    if (routes[url]) {
                        let to = routes[url];
                        if (to.inline) {
                            let ph = path.join(this[to.root], to.path),
                                contents = '';
                            if (fs.existsSync(ph)) {
                                contents = fs.readFileSync(ph, 'UTF-8');
                            } else {
                                this.log(`${url} module not exist`, 'warning');
                            }
                            done({
                                contents
                            });
                        } else {
                            let ph = path.join(this[to.root], to.path);
                            if (fs.existsSync(ph)) {
                                done({
                                    file: ph
                                });
                            } else {
                                done({
                                    contents: to.default || ''
                                });
                            }
                        }
                    } else {
                        if (/ungic\.component(\..+)?$/.test(url)) {
                            if (url == 'ungic.component.props') {
                                let cid;
                                if (!path.isAbsolute(prev)) {
                                    let parsed = prev.split('.');
                                    cid = parsed[2];
                                } else {
                                    cid = this.cidByPath(prev);
                                }
                                return done({
                                    file: path.join(this.components, cid, '.core', 'props')
                                });
                            } else {
                                if (path.isAbsolute(prev)) {
                                    let ph = url.replace('ungic.component', '').replace('.', path.sep);
                                    let cid = this.cidByPath(prev);
                                    
                                    if(['', path.sep + 'core', path.sep].includes(ph)) {
                                        ph = '.core';
                                    }       

                                    return done({
                                        file: path.join(this.components, cid, ph)
                                    });
                                } else {
                                    this.log('Inappropriate use of ungic.component module!');
                                    return done({
                                        content: ''
                                    });
                                }
                            }
                        } else {
                            if (/^ungic\.from-html/.test(url) || /^ungic\.slots/.test(url)) {
                                let slot = url.split('.')[2];
                                let cid = 'stdin';
                                if (prev != 'stdin') {
                                    cid = this.cidByPath(prev);
                                }
                                if (url.split('.').length == 3) {
                                    let allRulesByCID = _.filter(this.internalSassRules.storage, el => el.cid == cid);
                                    this.internalSassRulesRequired.set({
                                        cid,
                                        slot
                                    });
                                    let rulesByLID = _.filter(allRulesByCID, el => el.slot == slot);
                                    if (!rulesByLID) {
                                        this.log(`Attention! ${cid} component expects sass rules from html ${slot} slot. Please note that styles will be included only after processing of html plugin!.`, 'warning');
                                    } else {
                                        let rules = _.pluck(rulesByLID, 'rules').join(' ');
                                        return done({
                                            contents: rules
                                        });
                                    }
                                } else {
                                    this.log(`Warning while processing ${url} module in ${prev} file. To include sass styles for scss components from HTML plugin you need specify slot, example: sass.slots.part1.`, 'warning');
                                }
                                return done({
                                    contents: '@function exist() {@return false}'
                                });
                            } else if (/^ungic\.sprites/.test(url)) {
                                let storage = this.iconsStorage.sprite || this.iconsStorage.sprites;
                                if('object' == typeof storage && storage.data) {
                                    storage = storage.data;
                                }
                                if (storage) {
                                    let cid = 'stdin';
                                    if (prev != 'stdin') {
                                        cid = this.cidByPath(prev);
                                    }
                                    return done({
                                        contents: `$cid:${cid}; ` + storage.sass
                                    });

                                } else {
                                    this.warning(`Warning while processing ${url} module in ${prev} file. To include sprite sass module, you need to activate "sprites" mode in the icons plugin.`);
                                }
                                return done({
                                    contents: '@function exist() {@return false}'
                                });
                            } else if (/^ungic\.font-icons/.test(url) || /^ungic\.ficons/.test(url)) {
                                let storage = this.iconsStorage.font || this.iconsStorage.fonts;
                                if('object' == typeof storage && storage.data) {
                                    storage = storage.data;
                                }
                                if (storage) {
                                    let cid = 'stdin';
                                    if (prev != 'stdin') {
                                        cid = this.cidByPath(prev);
                                    }
                                    return done({
                                        contents: `$cid:${cid}; ` + storage.sass
                                    });

                                } else {
                                    this.warning(`Warning while processing ${url} module in ${prev} file. To include font-icons sass module, you need to activate "fonts" mode in the icons plugin and add to the project svg icons`);
                                }
                                return done({
                                    contents: '@function exist() {@return false}'
                                });
                            } else if (/^ungic\.components/.test(url)) {
                                let parsed = url.split('.');
                                if (parsed.length == 2) {
                                    return done({
                                        contents: '$cids: () !default;'
                                    });
                                }
                                let cid = parsed[2];
                                this.regComponentRouter(prev, cid);
                                if (parsed.length == 3) {
                                    if (!await fsp.exists(path.join(this.components, cid))) {
                                        this.error(`Error while processing ${url} module in ${prev}. ${cid} component does not exist`);
                                        return done({
                                            contents: '@function exist() {@return false}'
                                        });
                                    }
                                    return done({
                                        file: path.join(this.components, cid)
                                    });
                                } else {
                                    if (parsed[3] === 'core') {
                                        parsed[3] = '.core';
                                    }
                                    let route = parsed.slice(3).join(path.sep);

                                    let getFilePath = async() => {
                                        let exist = await fsp.exists(path.join(this.components, cid, route));
                                        if (exist) {
                                            return path.join(this.components, cid, route);
                                        }
                                        let existAsFile = await fsp.exists(path.join(this.components, cid, route + '.scss'));
                                        if (existAsFile) {
                                            return path.join(this.components, cid, route + '.scss');
                                        }
                                    }
                                    let existPath = await getFilePath();
                                    if (componentsMethods[route]) {
                                        return componentsMethods[route].call(this, cid, done);
                                    } else if (existPath) {
                                        let wEx = await fsp.exists(path.join(this.components, cid, route + '.scss'));
                                        return done({
                                            file: existPath
                                        });
                                    } else {
                                        let notRequired = ['once', 'properties', 'config', 'render'];
                                        if (!notRequired.includes(route)) {
                                            this.error(`Error while processing ${url} module in ${prev}. ${url} route not exists`);
                                        }
                                        return done({
                                            contents: '@function exist() {@return false}'
                                        });
                                    }
                                }
                            } else if (/^ungic\.themes/.test(url)) {
                                let splitted = url.split('.');
                                let theme = splitted[2];
                                return done({
                                    file: path.join(this.root, 'project', 'themes', theme)
                                });
                            } else {
                                this.error(`Error while processing ${url} module in ${prev}. ${url} route not exists`);
                                return done({
                                    contents: '@function exist() {@return false}'
                                });
                            }
                        }
                    }
                } else {
                    if (/^\@/.test(url)) {
                        if (!appPaths.node_modules) {
                            this.error('node_modules directory not found in current project');
                            this.system(`Are you trying to include ${url} from node_modules directory of current project, but this directory was not found in your project. You should install the required package into your project, please use npm install command.`, 'warning');
                            done({
                                contents: '@function exist() {@return false}'
                            });
                        } else {                             
                            let phToFile = path.join(appPaths.node_modules, url.replace('@', ''));
                            // Если нет такого пути, вероятно это файл
                            if(!await fsp.exists(phToFile) && path.extname(phToFile) == '') {
                                phToFile = phToFile + '.scss';
                            }     
                            // Проверяем файл с префиксом
                            if (!await fsp.exists(phToFile)) {
                                phToFile = path.join(path.dirname(phToFile), '_' + path.basename(phToFile));
                            }
                            if (await fsp.exists(phToFile)) {
                                done({
                                    file: phToFile
                                });
                            } else {                          
                                this.system(`Are you trying to include ${phToFile}, but this file or page was not found in your project.`, 'warning');
                                done({
                                    contents: '@function exist() {@return false}'
                                });
                            }
                        }
                    } else {
                        done({
                            contents: '@function exist() {@return false}'
                        });
                    }
                }
            } catch (e) {
                let message = e.stack;
                this.error(`Error while processing ${url} module in ${prev}. Sass compilation error: ${message}`);
                if (message.indexOf("NoSuchMethodError: method not found: 'call'") != -1) {
                    this.error('Attempt to use an unknown "' + url + '" component. Error in ' + prev);
                }
                done({
                    contents: '@function exist() {@return false}'
                });
            }
        })();
    }
    rebuild(cids) {
        this.renderMaster.add({
            description: `${cids} components`,
            components: cids
        });
    }
    generateVars(cids, source) {
        let config = this.config;       
        let colors = new Map;
        for(let color of this.colorsVars.storage) {
            if(cids.includes(color.cid)) {
                colors.set(color.source, color);
            }
        }
        let vars = [];
        if(colors.size) {
            colors.forEach((color) => {
                let inversePrefix = false;

                if(color.inverseSupport && color.inverseMode) {
                    inversePrefix = '.un-inverse';                    
                }

                if(!color.themePrefix) {
                    if(!inversePrefix) {
                        vars.push({
                            'selector': ':root',
                            'var': color.varName,
                            'color': color.color
                        });
                    } else {
                        vars.push({
                            'selector': inversePrefix,
                            'var': color.varName,
                            'color': color.color
                        });
                    }
                } else {
                    // Имеет конкретную тему, имеет класс темы .un-theme-{name}
                    let themeSelector = `.un-theme-${color.themeName}`;

                    if(!inversePrefix) {
                        vars.push({
                            'selector': themeSelector,
                            'var': color.varName,
                            'color': color.color
                        });
                    } else {
                        vars.push({
                            'selector': inversePrefix + themeSelector,
                            'var': color.varName,
                            'color': color.color
                        });
                    }
                }
            });
        }
        let output = '';
        if(source) {
            return vars;
        }
        if(vars.length) {
            let data = _.groupBy(vars, 'selector');
            for(let selector in data) {                
                output = output + ` ${selector}{${data[selector].map(e => `${e.var}:${e.color}`).join(';')}}`;
            }
        }
        return output;
    }
    _sassRender(data, cids, config = {}) {        
        let exportsStorage = [];
        let functions = _.extend(encodeFunction, {
            "provide-color($color)": (color) => {
                let sassString = sass.types.String;
                let sassColor = sass.types.Color;
                if(color instanceof sass.types.Color) {
                    return color
                } else {
                    let varName = color.getValue();
                    let colorFound = _.find(this.colorsVars.storage, e => e.cssVarName == varName);
                    if(colorFound) {
                        let obj = rgbcolor(colorFound.color).channels();
                        return new sassColor(obj.r, obj.g, obj.b);
                    }
                }
                return new sassString("");
            },
            "is-release()": () => {
                if (config.release) {
                    return sass.types.Boolean.TRUE
                } else {
                    return sass.types.Boolean.FALSE
                }
            },
            "ungic-save-color($data)": (data) => {
                let sassString = sass.types.String;
                let payload = {};
                for (let i = 0; i < data.getLength(); i++ ) {
                    let key = data.getKey(i).getValue();                  
                    let value = data.getValue(i).getValue();
                    let nums = ['hueOffset', 'saturation'];
                    if(key == 'colorName' || key == 'color') {
                        value = value.replace(/'|"/g, '');
                    }                 
                    payload[key] = (typeof value == 'number') ? parseFloat(value) : value;     
                                
                }         
                let source = JSON.stringify(_.omit(payload, 'color'));
                let toID = (num) => {
                    return num.toString().replace('.', '0');
                }
                
                let varName = `--uc-${payload.colorName}`;
                
                if(payload.colorTint !== 0) {                    
                    varName = varName + `-${toID(payload.colorTint)}t`;
                }    
                if(payload.hueOffset !== 0) {
                    varName = varName + `-${toID(payload.hueOffset)}h`;
                }    
                if(payload.saturation !== 0) {
                    varName = varName + `-${toID(payload.saturation)}s`;
                }
              
                for(let cid of cids) {  
                    if(!_.find(this.colorsVars.storage, e => e.cid == cid && e.source == source))  {  
                        this.colorsVars.set({
                            cid,                            
                            varName,
                            cssVarName: 'var('+varName+')',
                            source,
                            ...payload                  
                        }); 
                    }                
                }
                return new sassString(varName);
            },
            "to-export($cid, $oid, $data)": (cid, oid, data) => {
                cid = cid.getValue();
                oid = oid.getValue();
                data = data.getValue();
                try {
                    data = JSON.parse(data);
                    exportsStorage.push({
                        oid,
                        cid,
                        data,
                        id: cid + '__' + oid
                    });
                } catch (e) {
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

        /*if (process.env.NODE_ENV == 'development') {
            renderConfig.fiber = Fiber
        }*/
        if (this.activeRelease) {
            renderConfig.sourceMap = "string";
            renderConfig.sourceMapContents = true;
        }

        return new Promise(done => {
            sass.render(renderConfig, (err, result) => {              
                if (err) {
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
        if (buildConfig.autoprefixer) {
            plugins.push(autoprefixer);
        }
       // let build = this.builder.config;
        let rtlOptions;
        if (buildConfig.direction) {
            if (buildConfig.direction == 'rtl' || buildConfig.oppositeDirection) {
                rtlOptions = {}
                if (buildConfig.direction == 'rtl' && buildConfig.oppositeDirection) {
                    rtlOptions.fromRTL = true;
                }
                if (!buildConfig.oppositeDirection) {
                    rtlOptions.onlyDirection = buildConfig.direction;
                }
            }
        }

        let params = {
            themeColorsVarsMode: config.themeColorsVarsMode
        }
        if(release) {
            params = _.extend(params, release);
        }
        plugins.push(postcssTheme(params));

        if (release) {  
            let releasePath = release.outputReleasePath; 
            plugins.push(srcReplacer({
                release,
                log: this.log.bind(this),
                assets: this.project.assets,
                dist: this.dist,
                relativeDist: config.fs.dist.css,
                releaseDistPath: releasePath
            }));
        }
        
        let events = [];

        
        if (rtlOptions) {
            rtlOptions.prefixType = 'attribute';
            rtlOptions.prefix = config.dirAttribute || 'dir';
           
            if (!(buildConfig.direction == 'ltr' && !buildConfig.oppositeDirection)) {
                plugins.push(rtl(rtlOptions));
            }          
            //if(config.topSelector == 'html') {
            plugins.push(postcssThemeAfter({
                dirAttribute: config.dirAttribute || 'dir',
                htmlIsRootElement: config.htmlIsRootElement
            }));
            //}
        }

        let cleanscssMerging;

        if (config.cleancss) {
            let configCleanCss = typeof config.cleancss == 'object' ? config.cleancss : {};
            cleanscssMerging = _.extend({ level: 2 }, this.project.app.PLUGINS_SETTINGS.cleancss, configCleanCss);
        }

        if ((buildConfig.themeMode == 'external' || buildConfig.inverseMode == 'external') && release) {
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

        if (cleanscssMerging) {
            if (release) {
                plugins.push(clean(cleanscssMerging));
            } else {
                plugins.push(clean({
                    level: 1
                }));
            }
        }

        events.push(new Promise(done => {
            postcss(plugins)
                .process(data, { from: undefined })
                .then(result => {
                    done(result.css);
                }).catch(e => {
                    console.log(e);
                });
        }));
        return Promise.all(events);
    }
    async componentHasRender(cid) {
        let hasRender = await fsp.exists(path.join(this.components, cid, 'render.scss'));
        if (!hasRender) {
            return false
        }
        let content = await fsp.readFile(path.join(this.components, cid, 'render.scss'), 'UTF-8');
        if (content.trim() == '') {
            return false
        }
        return true
    }
    getComponentParamsFromContent(content) {
        let regexp = /\/\**\s?\:{4}([\w\W]+?)\*{1,}(?=\/)\//gim;
        let result, params = {}, parseParam = (val) => {
            if(["true", "false"].includes(val)) {
                return JSON.parse(val);
            }
            return val;
        }
        while (result = regexp.exec(content)) {
            if(result && result[1]) {
                let result2;
                let regexp2 = /^\s*([A-z]+[^:]*)\s*:\s*([^\n\s]+)/gmi;
                while (result2 = regexp2.exec(result[1].trim())) {
                    if(result2 && result2[2]) {
                        params[result2[1]] = parseParam(result2[2].trim());
                    }
                }
            }
        }
        return params;
    }
    generateDistSrc(relativePath) {
        if(!this.activeRelease) {
            return urlJoin(this.project.fastify.address, relativePath);
        }
        let host = this.activeRelease.host;
       
        if(host != '') { 
            return urlJoin(host, relativePath);
        } else {
            return urlJoin('/', relativePath);
        }
    }
    async _renderComponents(components, release) {
        for (let cid of components) {           
            if (!await this.componentHasRender(cid)) {
                components = _.without(components, cid);
                this.log(`${cid} component does not have a render file, or it is empty, this component will be skipped.`, 'warning');
            }
        }
        if (!components.length) {
            return
        }
        let renderTemplate = path.join(this.framework, 'render.hbs.scss');
        renderTemplate = await fsp.readFile(renderTemplate, 'UTF-8');
        let config = this.config;
        let source = { components: await this.getComponents(), render: components, themeColorsVarsMode: config.themeColorsVarsMode, generateThemeColorsVars: config.generateThemeColorsVars };

        this.internalSassRulesRequired.clean(e => components.indexOf(e.cid) != -1);
        this.iconsSaveStorage.clean(e => components.indexOf(e.cid) != -1);
        this.componentsDepends.clean(e => components.indexOf(e.cid) != -1);     
        this.colorsVars.clean(e => components.indexOf(e.cid) != -1);   
        let toRemove = this.exports.filter(exp => ['project'].concat(components).indexOf(exp.get('cid')) != -1);
        this.exports.remove(toRemove, { silent: true });  
        let build = this.builder.config;
        let buildConfig = build.dev;
        if (!await fsp.exists(this.root, 'project', 'themes', source.theme) && !await fsp.exists(this.root, 'project', 'themes', source.theme + '.scss')) {
            this.error(`${source.theme} theme in the project does not exist`, { exit: true });
        }

        if (!release) {  
            // В деве всегда один, на всякий случай         
            if(components.length == 1) {
                let pathToIndexFile = path.join(this.components, components[0], 'index.scss');
                if(await fsp.exists(pathToIndexFile)) {
                    let content = await fsp.readFile(pathToIndexFile, 'UTF-8');
                    let params = this.getComponentParamsFromContent(content);      
                    //console.log(params);
                    buildConfig = _.extend({}, buildConfig, params);
                }
            }    
            source.theme = buildConfig.theme;
            let data = [];
            source.themePrefix = false;
            source.defaultTheme = true;
            source.inverse = false;
            source.defaultInverse = buildConfig.defaultInverse;
            source.inverseSupport = buildConfig.inverse;
            
            let res = await this._sassRender(hbs.compile(renderTemplate)(source), components);
            if (res && res.css) {
                data.push(res.css);           
               
                if (source.inverseSupport) {
                    source.inverse = true;
                    let response = await this._sassRender(hbs.compile(renderTemplate)(source), components);
                    data.push(response.css);
                }
            }
            if (data.length) {
                let result = await this._postcss(Buffer.concat(data), buildConfig);
                if (result.length === 1) {
                    result = result.shift();
                }
                let dir = '';
                if (!buildConfig.oppositeDirection) {
                    dir = '.' + buildConfig.direction;
                }
                if (result.trim() == '') {
                    result = '/* This component has no rules :( */'
                }
                let vars = this.generateVars(components);
                if(/^[\n\s]*@charset\s*"UTF-8";/.test(result)) {
                    result = result.replace(/^[\n\s]*@charset\s*"UTF-8";/, '@charset "UTF-8";' + vars);
                } else {
                    result = vars + ' ' + result;
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
            // по умолчанию режим инверсии в ложь
            source.inverse = false;
            source.release = true;
            source.defaultInverse = releaseData.defaultInverse;
            source.inverseSupport = releaseData.inverse;

            if (!this.releaseResults) {
                this.releaseResults = [];
            }
            let dir = '';
            if (!releaseData.oppositeDirection) {
                dir = (releaseData.direction ? '.' + releaseData.direction : '');
            }        
       
            let res = await this._sassRender(hbs.compile(renderTemplate)(source), components, { release });
            if (res && res.css) {
                data.push(res.css);              
             
                let sourceURL = path.join(releaseData.outputReleasePath, 'exports', (releaseData.filename ? releaseData.filename : releaseData.releaseName) + dir + '.scss.map');
                await fse.outputFile(sourceURL, res.map.toString());

                 // Если требуется инверсия
                if (source.inverseSupport) {
                    // Переключаем инверсию
                    source.inverse = true;
                    try {                    
                        let response = await this._sassRender(hbs.compile(renderTemplate)(source), components, { release });
                        data.push(response.css);
                        sourceURL = path.join(releaseData.outputReleasePath, 'exports', (releaseData.filename ? releaseData.filename : releaseData.releaseName) + dir + '-inverse.scss.map');
                        await fse.outputFile(sourceURL, response.map.toString());
                    } catch (e) {
                        console.log(e);
                    }
                }

                if (themes.length) {
                    // Выключаем режим инверсии                   
                    for (let theme of themes) {
                        source.defaultTheme = false;
                        source.inverse = false;
                        source.themePrefix = (theme == 'default' && releaseData.defaultTheme == "default") ? false : true;                        
                        source.theme = theme;
                        try {                         
                            let response = await this._sassRender(hbs.compile(renderTemplate)(source), components, { release });
                            data.push(response.css);
                            sourceURL = path.join(releaseData.outputReleasePath, 'exports', (releaseData.filename ? releaseData.filename : releaseData.releaseName) + dir + '-theme-' + theme + '.scss.map');
                            await fse.outputFile(sourceURL, response.map.toString());
                        } catch (e) {
                            console.log(e);
                        }
                        // Если инверсия требуется         
                        if (source.inverseSupport) {
                            // Переключаем инверсию
                            source.inverse = true;
                            try {                       
                                let response = await this._sassRender(hbs.compile(renderTemplate)(source), components, { release });
                                data.push(response.css);
                                sourceURL = path.join(releaseData.outputReleasePath, 'exports', (releaseData.filename ? releaseData.filename : releaseData.releaseName) + dir + '-theme-' + theme + '-inverse.scss.map');
                                await fse.outputFile(sourceURL, response.map.toString());
                            } catch (e) {
                                console.log(e);
                            }
                        }
                    }
                }       
                let vars = this.generateVars(components);
                data.unshift(Buffer.from(vars));            
               
                let result = await this._postcss(Buffer.concat(data), releaseData, release);
                let versionName = releaseData.noConflict ? ('v' + moment().unix() + '-') : '';

    
                for (let r of result) {
                    
                    if (typeof r == 'string') {
                        let output = await this.getReleseLabel(releaseData, r);                        
                        let url = path.join(config.fs.dist.css,  versionName + (releaseData.filename ? releaseData.filename : releaseData.releaseName) + dir + '.min.css');
 
                       
                        if(!releaseData.includeLocalStyles) {           
                            await fse.outputFile(path.join(releaseData.outputReleasePath, url), output);
                        }
                        this.releaseResults.push({
                            url: this.generateDistSrc(url),
                            order: 0,
                            content: output
                        });
                    } else {
                        let number = 1;
                        for (let e of r) {
                            if (e.root) {
                                let output = await this.getReleseLabel(releaseData, e.root);
                                let theme = e.theme ? e.theme : '';
                                try {
                                    //let vars = varsBySelector['.un-theme-' + theme] ? `.un-theme-${theme} {${varsBySelector['.un-theme-' + theme].map(e => `${e.var}:${e.color}`).join(';')}}` : '';
                                    let url = path.join(config.fs.dist.css, versionName + (releaseData.filename ? releaseData.filename : releaseData.releaseName) + '.theme-' + theme + dir + '.min.css');
                                    if(!releaseData.includeLocalStyles) {     
                                        await fse.outputFile(path.join(releaseData.outputReleasePath, url), output);
                                    }
                                    this.releaseResults.push({
                                        url: this.generateDistSrc(url),
                                        order: number,
                                        content: output
                                    });
                                } catch (e) {
                                    this.log(e, 'error');
                                }
                            }
                            if (e.inverse_root) {
                                let output = await this.getReleseLabel(releaseData, e.inverse_root);
                                let theme = e.theme;
                                try {                                   
                                    let label = (theme == 'default' && releaseData.defaultTheme == "default") ? '' : '.theme-' + theme;
                                    //let selector = (theme == 'default' && releaseData.defaultTheme == "default") ? '' : '.un-theme-' + theme;
                                   
                                    let url = path.join(config.fs.dist.css, versionName + (releaseData.filename ? releaseData.filename : releaseData.releaseName) + label + '-inverse' + dir + '.min.css');
                                    if(!releaseData.includeLocalStyles) {
                                        await fse.outputFile(path.join(releaseData.outputReleasePath, url), output);
                                    }    
                                    this.releaseResults.push({
                                        url: this.generateDistSrc(url),
                                        order: number + 1,
                                        content: output
                                    });
                                } catch (e) {
                                    this.log(e, 'error');
                                }
                            } 
                            number  = number + 2;                           
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
        for (let r in release) {
            if (Array.isArray(release[r])) {
                release[r] = release[r].join(', ');
            }
        }
        release.date = moment().format('DD.MM.YYYY, h:mm');
        let config = this.project.config;
        release.author = config.author;
        return hbs.compile(template)(release) + '\n' + raw;
    }
    async getThemes() {
        let themes = await fg('*.scss', { onlyFiles: true, cwd: path.join(this.root, 'project', 'themes') });
        return _.map(themes, t => path.basename(t, path.extname(t)));
    }
    async release(release) {    
        let components = release.components;
        for (let cid of release.components) {
            if (!await this.componentHasRender(cid)) {
                components = _.without(components, cid);
                release.components = components;
                this.log(`${cid} component does not have a render file, or it is empty, this component will be skipped.`, 'warning');
            }
        }
        if (!components.length) {
            return this.system('To create a release, you must select at least one component that has a render file', 'warning');
        }

        this.activeRelease = release;
        let releasePath = release.outputReleasePath;
  
        try {
            let success = await this._renderComponents(components, release);
            if (success) {
                this.system(`${release.releaseName} release successfully generated to ${releasePath}`, true);
            }
        } catch (e) {
            this.system(`${release.releaseName} release not generated.`, false);
            this.system(e, 'error');
        }
        let data = this.releaseResults;
        delete this.releaseResults;
        delete this.activeRelease;
        //console.log(data);
        data = _.sortBy(data, 'order');
        return data;
    }
    async _render(events) {
        this.emit('render');
       // let config = this.config;
       // let prjConfig = this.project.config;
        for (let event of events) {
            try {
                let success = await this._renderComponents(event.components);
                if (success) {
                    this.system(`Styles for ${event.components.join(',')} component(s) were successfully generated!`);
                }
            } catch (e) {
                console.log(e);
            }
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
            if (this.project.config.verbose) {
                this.log(message, type);
            }
        });
        this.on('watcher', (event, rp, ph, stat) => {
            rp = path.normalize(rp).replace(/^[\\\/]+/, '');
            
            if(rp.indexOf(path.normalize(this.relativePath).replace(/^[\\\/]+/, '')) !== 0) {
                return
            } 
            if (path.extname(ph) == '.scss') {
                this.watchController.emit('bind', event, ph);
            }
        });

        this.on('ready', async() => {
            let toPath = path.join(this.dist, 'exports', 'sass-options.json');

            if (this.activeRelease) {
                //console.log(this.activeRelease.outputReleasePath);
                toPath = path.join(this.activeRelease.outputReleasePath, 'exports', 'sass-options.json');
                delete this.activeRelease;
            }

            await fse.outputFile(toPath, JSON.stringify(this.exports.toJSON(), null, 4));
        });

        let components = await this.getComponents();
        if (components.length) {
            for (let cid of components) {
                this.renderMaster.add({
                    description: `${cid} component`,
                    components: [cid]
                });
            }
        }


        if (!await fsp.exists(path.join(this.root, 'project'))) {
            await fse.copy(path.join(this.framework, 'project'), path.join(this.root, 'project'));
        }

        if (this.project.config.build.plugins[this.id]) {
            try {
                this.builder = new builder(require('./build.model-scheme'), this.project.config.build.plugins[this.id]);
            } catch (e) {
                return this.system('SCSS build scheme incorrect. Origin: \n' + e.message, 'error', { exit: true });
            }
        }
    }
    async fileChanged(events) {
        let components = [];
        let component_phs = [];
        for (let event in events) {
            if (_.find(events[event], e => e.dirname.indexOf(this.components) == -1)) {
                components = await this.getComponents();
                break
            }

            for (let ev of events[event]) {
                let cid = this.cidByPath(ev.dirname);
                component_phs.push({
                    cid,
                    path: ev.path
                })
                if (components.indexOf(cid) == -1) {
                    if (await fsp.exists(path.join(this.components, cid))) {
                        components.push(cid);
                    }
                }
            }
        }

        if (components.length) {
            for (let cid of components) {
                let deps = this.getDepsFor(cid);
                if (deps.length) {
                    for (let dep of deps) {
                        if (components.indexOf(dep) == -1 && _.find(component_phs, e => (e.cid == cid && path.basename(path.relative(path.join(this.components, e.cid), e.path), path.extname(e.path)) != 'render' && path.dirname(path.relative(path.join(this.components, e.cid), e.path)) != 'render'))) {
                            if (this.project.config.verbose) {
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
        if (options.icons) {
            this.iconsStorage = options.icons;
        }
        this.project.on('icons', e => {
            if (!e.data && this.iconsStorage[e.type]) {
                delete this.iconsStorage[e.type];
                return
            }
            this.iconsStorage[e.type] = e;
        });
        try {
            await this.renderMaster.run();
        } catch (e) {
            console.log(e);
        }
        let status = this.renderMaster.status();
        if (status.clean) {
            this.emit('rendered', true);
        }
        this.emit('begined', true);
    }
    cidByPath(ph) {
        let cid = path.dirname(path.relative(this.components, ph)).split(path.sep).shift();
        if (cid == '.') {
            return path.basename(path.relative(this.components, ph)).split(path.sep).shift();
        }
        return cid;
    }
    cleanHtmlInternalSass(htmlModelId) {
        this.internalSassRules.clean(e => e.htmlModelId == htmlModelId);
    }
    setHtmlInternalSass(data) {
        for (let d of data) {
            d.rules = d.rules.replace(/@use\s*("|')(\.core)("|')/gm, `@use "ungic.components.${d.cid}"`).replace(/@use\s*(?:"|')(ungic\.component(\..+)?)(?:"|')/gm, function(match, str, ph = '') {
                return `@use "ungic.components.${d.cid}${ph}"`;
            });
            //console.log(d.rules);
            this.internalSassRules.set(d);
        }
        // Group by CID
        let cidsToRebuild = _.uniq(_.pluck(data, 'cid'));

        // Получить все требуемые части для одного из компонентов
        let lidsWithCids = _.filter(this.internalSassRulesRequired.storage, el => cidsToRebuild.indexOf(el.cid) != -1);

        //console.log(lidsWithCids);
        if (lidsWithCids.length) {
            // Отфильтровать до используемых лидов
            let cids = _.uniq(_.pluck(_.filter(lidsWithCids, c => _.find(data, d => d.slot == c.slot && d.cid == c.cid)), 'cid'));

            //console.log('cids', cids);
            this.renderMaster.add({
                description: `${cids.join(', ')} components`,
                components: cids
            });
            /*if(cids.length > 1) {
                let config = this.config;
                let buildConfig = this.builder.config.dev.config;
                let dir = '';
                if(!buildConfig.oppositeDirection) {
                    dir = '.' + buildConfig.direction;
                }
                return path.join(config.fs.dist.css, cids.join('-')  + dir + '.css').replace(/\\+/g, '/');
            }*/
        }
    }
    getComponents() {
        return fg('**', { dot: false, onlyDirectories: true, cwd: this.components, deep: 1 });
    }
    async createComponent(cid) {
        let toPath = path.join(this.components, cid);
        if (await fsp.exists(toPath)) {
            throw new Error(`${cid} component already exists`);
        }
        let watched = this.unwatched;
        this.unwatch();
        await fse.copy(path.join(this.framework, 'component'), toPath);
        this.emit('added', cid);
        if (!watched) {
            this.watch();
        }
        this.renderMaster.add({
            description: `${cid} component`,
            components: [cid]
        });
    }
    async removeComponent(cid) {
        let toPath = path.join(this.components, cid);
        if (await fsp.exists(toPath)) {
            let deps = this.getDepsFor(cid);
            if (deps.length) {
                throw new Error(`This component cannot be removed because it is used in other components! First, remove its use in the following components: ${deps.join(', ')}`);
            }
            let watched = this.unwatched;
            this.unwatch();
            this.componentsDepends.clean(e => e.cid == cid);  
            this.internalSassRulesRequired.clean(e => e.cid == cid);  
            this.iconsSaveStorage.clean(e => e.cid == cid);  
            await fse.remove(toPath);
            this.emit('removed', cid);
            if (!watched) {
                this.watch();
            }
        } else {
            throw new Error(`${cid} component not exists`);
        }
    }
}

module.exports = scssPlugin;