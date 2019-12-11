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
const {extend: Collection} = require('../../modules/collection');
const {extend: Model} = require('../../modules/model');
const sass = require("sass");
const Fiber = require("fibers");
const encodeFunction = require('../../modules/sass-json');
const postcss = require('postcss');
const clean = require('postcss-clean');
//const rtlcss = require('rtlcss');
const rtl = require('postcss-rtl');
const autoprefixer = require('autoprefixer');

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
            if(event == 'updated' || event == 'added' || event == 'removed') {
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
            let routes = require('./route');
            if(/^ungic\./.test(url)) {
                if(routes[url]) {
                    let to = routes[url];
                    done({
                        file: path.join(this[to.root], to.path)
                    });
                } else {
                    if(/^ungic\.components/.test(url)) {
                        let parsed = url.split('.');
                        let cid = parsed[2];
                        this.regComponentRouter(cid, prev);
                        if(parsed.length == 3) {
                            if(!await fsp.exists(path.join(this.components, cid))) {
                                return this.error(`${cid} component does not exist`, {exit:true});
                            }
                            return done({
                                file: path.join(this.components, cid)
                            });
                        } else {
                            let route = parsed.pop();
                            if(route == 'core') {
                                route = '.core';
                            }

                            if(componentsMethods[route]) {
                                return componentsMethods[route].call(this, cid, done);

                            } else if(await fsp.exists(path.join(this.components, cid, route)) || await fsp.exists(path.join(this.components, cid, route + '.scss'))) {
                                return done({
                                    file: path.join(this.components, cid, route)
                                });
                            } else {
                                return this.error(`${route} handler not found for routing component`, {exit:true});
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
                    }
                }
            } else {
                done();
            }
        })();
    }
    _sassRender(data, cids, config={}) {
        let functions = _.extend(encodeFunction, {
            "to-export($cid, $oid, $data)":  (cid, oid, data) => {
                cid = cid.getValue();
                oid = oid.getValue();
                data = data.getValue();
                try {
                    data = JSON.parse(data);
                    this.exports.add({
                        oid, cid, data, id: cid + '-' + oid
                    });
                } catch {
                    this.log(`${oid} exported option of ${cid} component has invalid json format.`);
                }
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
                    this.error(err.message);
                    return done(false);
                }
                done(result.css);
            });
        });
    }
    async _postcss(data, buildConfig, release) {
        let postcssTheme = require('../../modules/postcss-theme');
        let postcssSplitter = require('../../modules/postcss-splitter');
        let plugins = [];
        if(buildConfig.autoprefixer) { // autoprefixer, rtl(rtlOptions)
            plugins.push(autoprefixer);
        }
        let rtlOptions;
        if(buildConfig.direction) {
            rtlOptions = {
                 addPrefixToSelector: (selector, prefix) => {
                    if(prefix == '[dir]' || prefix.indexOf(buildConfig.direction) != -1) {
                        return selector;
                    }
                    return `${prefix} ${selector}`;
                }
            }
            if(buildConfig.direction == 'rtl' && buildConfig.opposite_direction) {
                rtlOptions.fromRTL = true;
            }
            if(!buildConfig.opposite_direction) {
                rtlOptions.onlyDirection = buildConfig.direction;
            }
        }

        plugins.push(postcssTheme());

        let events = [];

        if(rtlOptions) {
            plugins.push(rtl(rtlOptions));
        }
        let cleanscssMerging = _.extend({level: 2}, process.env.postcss_clean);
        if(release) {
            plugins.push(clean(cleanscssMerging));
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
        events.push(new Promise(done => {
            postcss(plugins)
            .process(data, {from: undefined})
            .then(result => {
                //console.log(result.css);
                done(result.css);
            });
        }));
        return Promise.all(events);
    }
    async _renderComponents(components, release) {
        let renderTemplate = path.join(this.framework, 'render.hbs.scss');
        renderTemplate = await fsp.readFile(renderTemplate, 'UTF-8');
        let config = this.config;
        let source = {components: await this.getComponents(), render: components, advanced_export: config.advanced_export};

        // dev
        let build = this.builder.config;
        let buildConfig = build.dev.config;
        if(!await fsp.exists(this.root, 'project', 'themes', source.theme) && !await fsp.exists(this.root, 'project', 'themes', source.theme + '.scss')) {
            this.error(`${source.theme} theme in the project does not exist`, {exit: true});
        }

        if(!release) {
            source.theme = build.dev.default_theme;
            let data = [];
            source.theme_prefix = source.theme == 'default' ? false : build.single_theme_prefix;
            let res = await this._sassRender(hbs.compile(renderTemplate)(source), components);
            if(res) {
                data.push(res);
                source.inverse = buildConfig.inverse;
                if(source.inverse) {
                    data.push(await this._sassRender(hbs.compile(renderTemplate)(source), components));
                }
            }
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
            source.theme_prefix = themes.length ? true : build.single_theme_prefix;
            if(source.theme == 'default') {
                source.theme_prefix = false;
            }
            let res = await this._sassRender(hbs.compile(renderTemplate)(source), components, {main: true});
            if(res) {
                data.push(res);
                source.inverse = buildConfig.inverse;
                if(source.inverse) {
                    data.push(await this._sassRender(hbs.compile(renderTemplate)(source), components));
                }

                if(themes.length) {
                    for(let theme of themes) {
                        source.theme_prefix = (theme  == 'default') ? false : true;
                        source.inverse = false;
                        source.theme = theme;
                        data.push(await this._sassRender(hbs.compile(renderTemplate)(source), components), {main: true});
                        source.inverse = buildConfig.inverse;
                        if(source.inverse) {
                            data.push(await this._sassRender(hbs.compile(renderTemplate)(source), components));
                        }
                    }
                }
                let result = await this._postcss(Buffer.concat(data), buildConfig, release.config);
                let dir = '';
                if(!buildConfig.opposite_direction) {
                    dir = '.' + buildConfig.direction;
                }
                for(let r of result) {
                    if(typeof r == 'string') {
                        let output = await this.getReleseLabel(release.config, r);
                        await fse.outputFile(path.join(this.dist, config.fs.dist.css, 'releases', release.config.name + '.' + release.config.version  + dir + '.css'), output);
                    } else {
                        for(let e of r) {
                            let output = await this.getReleseLabel(release.config, e.root);
                            let theme = e.theme;
                            await fse.outputFile(path.join(this.dist, config.fs.dist.css, 'releases', release.config.name + '.theme-' + theme + '.' + release.config.version  + dir + '.css'), output);
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
            release.themes.push(release.default_theme);
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
        await this._renderComponents(components, {
            name,
            config,
            build: releaseConfig
        });
        this.log(`${name} release successfully generated!`);
    }
    async _render(events) {
        //console.log(events);
        let config = this.config;
        let prjConfig = this.project.config;
        for(let event of events) {
            await this._renderComponents(event.components);
            this.log(`Styles for ${event.components.join(',')} components were successfully generated!`);
        }
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

        if(!await fsp.exists(path.join(this.root, 'builder.json'))) {
            this.builder = new builder(require('./framework/model-scheme'));
            await fse.outputFile(path.join(this.root, 'builder.json'), JSON.stringify(this.builder.config, null, 4));
        } else {
            let build = await fsp.readFile(path.join(this.root, 'builder.json'), 'UTF-8');
            try {
                build = JSON.parse(build);
            } catch(e) {
                this.error('Builder.json file has invalid json format. Origin: ' + e.message, {exit: true});
            }

            try {
                this.builder = new builder(require('./framework/model-scheme'), build);
            } catch(e) {
                return this.error('Builder.json file has incorrect data. Origin: ' + e.message, {exit: true});
            }
        }

    }
    async fileChanged(events) {
        let components = [];
        for(let event in events) {
            if(_.find(events[event], e => e.dirname.indexOf(this.components) == -1)) {
                components = await this.getComponents();
                break
            }
            for(let ev of events[event]) {
                let cid = this.cidByPath(ev.dirname);
                if(components.indexOf(cid) == -1) {
                    if(await fsp.exists(path.join(this.components, cid))) {
                        components.push(cid);
                    }
                }
            }
        }
        if(components.length) {
            for(let cid of components) {
                this.renderMaster.add({
                    description: `${cid} component`,
                    components: [cid]
                });
            }
        }
    }
    async begin() {
        return this.renderMaster.run();
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
        this.unwatch();
        await fse.copy(path.join(this.framework, 'component'), toPath);
        this.emit('added', cid);
        this.watch();
        this.renderMaster.add({
            description: `${cid} component`,
            components: [cid]
        });
    }
    async removeComponent(cid) {
        let toPath = path.join(this.components, cid);
        if(await fsp.exists(toPath)) {
            let deps = [];
            for(let compID in this.depends) {
                if(this.depends[compID].indexOf(cid) != -1) {
                    deps.push(compID);
                }
            }
            deps = _.uniq(deps);
            if(deps.length) {
                throw new Error(`"${deps.join(', ')}" components depend on this component.`);
            }
            this.unwatch();
            await fse.remove(toPath);
            this.emit('removed', cid);
            this.watch();
        } else {
            throw new Error(`${cid} component not exists`);
        }
    }
}

module.exports = scssPlugin;