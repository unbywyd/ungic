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
const path = require('path');
const skeleton = require('../../modules/skeleton');
const renderMaster = require('../../modules/render-master');
const watchGrouping = require('../../modules/watch-grouping');
const {extend: Collection} = require('../../modules/collectionSync');
const {extend: Model} = require('../../modules/model');
const sass = require("sass");
const Fiber = require("fibers");
const encodeFunction = require('../../modules/sass-json');
const postcss = require('postcss');
const clean = require('../../modules/postcss-clean');
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
            //console.log(model);
            if(event == 'updated' || event == 'add' || event == 'removed') {
                this.emit('exports', event, model);
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
                        done({
                            file: path.join(this[to.root], to.path)
                        });
                    } else {
                        if(/^ungic\.sprites/.test(url)) {
                            if(this.iconsStorage.sprite) {
                                let cid = 'stdin';
                                if(prev != 'stdin') {
                                    cid = this.cidByPath(prev);
                                }
                                return done({
                                    contents: `@function exist() {@return true}; $cid:${cid}; ` + this.iconsStorage.sprite.data.sass
                                });

                            } else {
                                this.warning('To include sprite sass module, you need to activate "sprites" mode in the icons plugin');
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
                                    contents: `@function exist() {@return true}; $cid:${cid}; ` + this.iconsStorage.fonts.data.sass
                                });

                            } else {
                                this.warning('To include font-icons sass module, you need to activate "fonts" mode in the icons plugin and add to the project svg icons');
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
                                    this.error(`${cid} component does not exist`);
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
                                        this.warning(`${cid} component has no method for rendering`);
                                    } else {
                                        this.error(`${route} handler not found for routing component`);
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
                            this.error(`${url} route not exists`);
                            return done({
                                contents: ''
                            });
                        }
                    }
                } else {
                    done();
                }
            } catch(e) {
                console.log(e);
            }
        })();
    }
    _sassRender(data, cids, config={}) {
        let exportsStorage = [];
        let functions = _.extend(encodeFunction, {
            "release()": () => {
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
                    /*this.exports.add({
                        oid, cid, data, id: cid + '.' + oid
                    });*/
                } catch {
                    this.log(`${oid} exported option of ${cid} component has invalid json format.`);
                }
                return sass.types.Boolean.TRUE
            },
            "ungic-save-font-icon($cid, $icon_id)": (cid, icon_id) => {
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

        return new Promise(done => {
            sass.render(renderConfig, (err, result) => {
                if(err) {
                    console.log(err);
                    this.error(err.message);
                    return done(false);
                }
                this.exports.add(exportsStorage);
                //console.log(exportsStorage);
                done(result.css);
            });
        });
    }
    async _postcss(data, buildConfig, release) {
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
            if(buildConfig.direction == 'rtl' || buildConfig.opposite_direction) {
                rtlOptions = {}
                if(buildConfig.direction == 'rtl' && buildConfig.opposite_direction) {
                    rtlOptions.fromRTL = true;
                }
                if(!buildConfig.opposite_direction) {
                    rtlOptions.onlyDirection = buildConfig.direction;
                }
            }
        }

        plugins.push(postcssTheme());

        let events = [];

        if(rtlOptions) {
            if(build.rtl_prefix.prefixType) {
                rtlOptions.prefixType = build.rtl_prefix.prefixType;
            }
            if('string' == typeof build.rtl_prefix.prefix && build.rtl_prefix.prefix.length) {
                rtlOptions.prefix = build.rtl_prefix.prefix;
            }
            if(!(buildConfig.direction == 'ltr' && !buildConfig.opposite_direction)) {
                plugins.push(rtl(rtlOptions));
            }
            if(build.top_selector == 'html') {
                plugins.push(postcssThemeAfter());
            }
        }
        let cleanscssMerging = _.extend({level: 2}, process.env.postcss_clean);
        if(release) {
            plugins.push(clean(cleanscssMerging));
        } else {
            plugins.push(clean({
                level: 1
            }));
        }

        if(buildConfig.theme_mode == 'external' && release) {
           events.push(new Promise(res => {
                plugins.push(postcssSplitter({
                    callback: function(themes) {
                        res(themes);
                    }
                }));
            }))
        }
        let config = this.config;
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
        let source = {components: await this.getComponents(), render: components, advanced_export: config.advanced_export};

        this.iconsSaveStorage.clean(e => components.indexOf(e.cid) != -1);
        let toRemove = this.exports.filter(exp => ['project'].concat(components).indexOf(exp.get('cid')) != -1);
        this.exports.remove(toRemove, {silent: true});
        // dev
        let build = this.builder.config;
        let buildConfig = build.dev.config;
        if(!await fsp.exists(this.root, 'project', 'themes', source.theme) && !await fsp.exists(this.root, 'project', 'themes', source.theme + '.scss')) {
            this.error(`${source.theme} theme in the project does not exist`, {exit: true});
        }
        source.top_selector = build.top_selector;

        if(!release) {
            source.theme = build.dev.default_theme;
            let data = [];
            source.theme_prefix = false;
            source.default_theme = true;
            let res = await this._sassRender(hbs.compile(renderTemplate)(source), components);
            if(res) {
                data.push(res);
                source.inverse = buildConfig.inverse;
                if(source.inverse) {
                    data.push(await this._sassRender(hbs.compile(renderTemplate)(source), components));
                }
            }
            //console.log('Data length 365', data.length);
            if(data.length) {
                let result = await this._postcss(Buffer.concat(data), buildConfig);
                if(result.length === 1) {
                    result = result.shift();
                }
                let dir = '';
                if(!buildConfig.opposite_direction) {
                    dir = '.' + buildConfig.direction;
                }
                await fse.outputFile(path.join(this.dist, config.fs.dist.css, components.join('-') + dir + '.css'), result);
                this.emit('ready', components);
                return true;
            }
        } else {
            let data = [];
            buildConfig = release.build;
            source.theme = release.config.default_theme;
            let themes = release.config.themes ? release.config.themes : [];
            source.theme_prefix = false;
            /*if(source.theme == 'default') {
                source.theme_prefix = false;
            }*/
            source.default_theme = true;
            source.release = true;
            source.default_inverse = buildConfig.default_inverse;

            let res = await this._sassRender(hbs.compile(renderTemplate)(source), components, {release}); //  {main: true}
            if(res) {
                data.push(res);
                source.inverse = buildConfig.inverse;
                if(source.inverse) {
                    data.push(await this._sassRender(hbs.compile(renderTemplate)(source), components, {release}));
                }

                if(themes.length) {
                    for(let theme of themes) {
                        source.default_theme = false;
                        source.theme_prefix = (theme  == 'default') ? false : true;
                        source.inverse = false;
                        source.theme = theme;
                        data.push(await this._sassRender(hbs.compile(renderTemplate)(source), components, {release})); // {main: true}
                        source.inverse = buildConfig.inverse;
                        if(source.inverse) {
                            data.push(await this._sassRender(hbs.compile(renderTemplate)(source), components, {release}));
                        }
                    }
                }
                let result = await this._postcss(Buffer.concat(data), buildConfig, release.config);
                let dir = '';
                if(!buildConfig.opposite_direction) {
                    dir = '.' + buildConfig.direction;
                }
                await fse.remove(path.join(this.dist, 'releases', release.config.name + '.' + release.config.version, config.fs.dist.css));
                for(let r of result) {
                    if(typeof r == 'string') {
                        let output = await this.getReleseLabel(release.config, r);
                        await fse.outputFile(path.join(this.dist, 'releases', release.config.name + '.' + release.config.version, config.fs.dist.css, release.config.name  + dir + '.css'), output);
                    } else {
                        for(let e of r) {
                            let output = await this.getReleseLabel(release.config, e.root);
                            let theme = e.theme;
                            try {
                                await fse.outputFile(path.join(this.dist, 'releases', release.config.name + '.' + release.config.version, config.fs.dist.css, release.config.name + '.theme-' + theme + dir + '.css'), output);
                            } catch(e) {
                                console.log(e);
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
        if(release.themes) {
            if(release.themes.indexOf(release.default_theme) == -1) {
                release.themes.push(release.default_theme);
            }
        } else {
            release.themes = [release.default_theme];
        }
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
    async release(name, config={}) {
        let build = this.builder.config;
        let configName = config.config;
        let defaultConfig = build.release.config.default;

        let releaseConfig = defaultConfig;
        if(!build.release.config[configName]) {
            this.warning(configName + ' release configuration does not exist. The default configuration will be used.');
        } else {
            releaseConfig = build.release.config[configName];
        }

        let components = config.components;

        if(!components.length) {
            return this.error('At least one component is required to implement the release.', {exit: true});
        }
        try {
            await this._renderComponents(components, {
                name,
                config,
                build: releaseConfig
            });
        } catch(e) {
            console.log(e);
        }
        this.log(`${name} release successfully generated!`);
    }
    async _render(events) {
        let config = this.config;
        let prjConfig = this.project.config;
        for(let event of events) {
            try {
                await this._renderComponents(event.components);
            } catch(e) {
                console.log(e);
            }
            this.log(`Styles for ${event.components.join(',')} components were successfully generated!`);
        }
        this.emit('rendered', true);
    }
    async initialize() {
        let config = this.config;
        this.renderMaster = new renderMaster(_.extend(config.render, {
            id: this.id
        }), this._render.bind(this));

        this.renderMaster.on('log', (type, message) => {
            if(this.project.config.verbose) {
                this.log(message, type);
            }
        });
        this.on('watcher:'+ config.fs.dirs.source + ':' +config.fs[config.fs.dirs.source].scss, (event, ph, stat) => {
            if(path.extname(ph) == '.scss') {
                this.watchController.emit('bind', event, ph);
            }
        });

        this.on('ready', async() => {
            let toPath = path.join(this.dist, 'sass-options.json');
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
        }

        if(!await fsp.exists(path.join(this.root, 'build_schemes.json'))) {
            this.builder = new builder(require('./framework/model-scheme'));
            await fse.outputFile(path.join(this.root, 'build_schemes.json'), JSON.stringify(this.builder.config, null, 4));
        } else {
            let build = await fsp.readFile(path.join(this.root, 'build_schemes.json'), 'UTF-8');
            try {
                build = JSON.parse(build);
            } catch(e) {
                this.error('build_schemes.json file has invalid json format. Origin: ' + e.message, {exit: true});
            }

            try {
                this.builder = new builder(require('./framework/model-scheme'), build);
            } catch(e) {
                return this.error('build_schemes.json file has incorrect data. Origin: ' + e.message, {exit: true});
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
                                this.log(`${dep} component depends on ${cid} component, so ${dep} component will be be reassembled.`);
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
        this.emit('begined', true);
    }
    cidByPath(ph) {
        let cid = path.dirname(path.relative(this.components, ph)).split(path.sep).shift();
        if(cid == '.') {
            return path.basename(path.relative(this.components, ph)).split(path.sep).shift();
        }
        return cid;
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