const plugin = require('../');
const fg = require('fast-glob');
const fs = require('fs');
const url = require('url');
const fsp = fs.promises;
const fse = require('fs-extra');
const pretty = require('pretty');
const queryString = require('query-string');
const _ = require('underscore');
const { promisify } = require("util");
fsp.exists = promisify(fs.exists);
const path = require('path');
const Handlebars = require('handlebars');
const {extend: Collection} = require('../../modules/collection');
const {extend: Model} = require('../../modules/model');
const renderMaster = require('../../modules/render-master');
const skeleton = require('../../modules/skeleton');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const MD = new(require('markdown-it'));
const yaml = require('js-yaml');
class typeHandlers extends skeleton {
    constructor(options={}) {
        super({},{}, options);
        this.handlers = new Map;
    }
    set(handlerID, handler) {
        if(!handlerID) {
            throw new Error(`handlerID is required`);
        }
        if("function" != typeof handler) {
            throw new Error(`handler must be a function`);
        }
        this.handlers.set(handlerID, handler);
    }
    has(handlerID) {
        return this.handlers.has(handlerID);
    }
    get(handlerID) {
        return this.handlers.get(handlerID);
    }
}
class sassOptionsStorage {
    constructor() {
        this.storage = [];
    }
    set(eid, page_id) {
        if(this.get(page_id, eid)) {
            return;
        }
        this.storage.push({eid, page_id});
    }
    get(page_id, eid) {
        if(!page_id && !eid) {
            return this.storage;
        }
        if(page_id && !eid) {
            return _.findWhere(this.storage, {page_id});
        }
        if(eid && !page_id) {
            return _.findWhere(this.storage, {eid});
        }
        return _.findWhere(this.storage, {page_id, eid});
    }
    clean(page_id) {
        this.storage = _.reject(this.storage, m => m.page_id == page_id);
    }
}
class htmlPlugin extends plugin {
    constructor(config={}, sysconfig={}) {
        config.id = 'html';
        super(require('./model-scheme'), config, sysconfig);
        this.ungicParser = new(require('./utils/parser'));
        this.resources = new Map;
        this.typeHandlers = new typeHandlers;
        this.typeHandlers.set('md', async attrs => {
            attrs.source = attrs.body;
            attrs.body = MD.render(attrs.body);
            return attrs;
        });

        this.sassOptions = new sassOptionsStorage;
        this.typeHandlers.set('json', async attrs => {
            try {
                attrs.body = JSON.parse(attrs.body);
            } catch(e) {
                let entity = attrs.path ? attrs.path : attrs.id;
                return this.log(new Error(`An error occurred while handling entity. Invalid JSON format. Entity: ${entity}`));
            }
            return attrs;
        });

        this.typeHandlers.set('yaml', async attrs => {
            attrs.source = attrs.body;
            try {
                attrs.body = yaml.safeLoad(attrs.body);
            } catch(e) {
                let entity = attrs.path ? attrs.path : attrs.id;
                return this.log(new Error(`An error occurred while handling entity. Invalid YAML format. Entity: ${entity}`));
            }
            return attrs;
        });

         this.typeHandlers.set('html', async attrs => {
            attrs.body = await this.ungicParser.parse(attrs.body, attrs);
            const dom = new JSDOM(attrs.body);
            if(!dom.window.document.head.children.length && dom.window.document.body.innerHTML.replace(/\s/g, '') != '') {
                attrs.body = dom.window.document.body.innerHTML;
            } else if (dom.window.document.body.innerHTML.replace(/\s/g, '') != '') {
                attrs.type = "page";
                let script = dom.window.document.createElement("script");
                script.setAttribute('src', this.project.fastify.address + '/dev/js/dist/pipe.min.js');
                script.setAttribute('data-connect', this.project.fastify.address);
                script.setAttribute('data-src', path.relative(this.project.root, path.join(this.dist, attrs.path)).replace(/\\+/g, '/'));
                dom.window.document.body.appendChild(script);
                attrs.body = dom.window.document.documentElement.outerHTML;
            } else {
                return;
            }
            return attrs;
        });

        config = this.config;
        let enums = _.uniq(_.values(config.supported_types));
        enums.push('page');
        let model = Model({
            type: {
                type: 'string',
                enum: enums,
                required: true
            },
            path: {
                type: 'string'
            }
        });
        let collection = Collection(model);

        this.collection = new collection({
            attrPrehandler: (attrs => {
                return this._attrHandler(attrs);
            })
        });
        this.collection.on('all', (event, model) => {
            if(event == 'updated' || event == 'added' || event == 'removed') {
                if(event == 'removed') {
                    if(model.get('type') == 'page') {
                        if(config.delete_from_dist) {
                            fse.remove(path.join(this.dist, model.get('path')));
                        }
                        return;
                    }
                }
                if(event == 'updated' || event == 'added') {
                    if(model.get('type') == 'page') {
                        //this.sassOptions.clean(model.id);
                        return this.renderMaster.add({
                            description: `${model.get('path')} page assembly`,
                            models: [model]
                        });
                    }
                }

                let attrs = model.toJSON();
                if(attrs.page_ids) {
                    let models = this.collection.filter(model => attrs.page_ids.indexOf(model.id) != -1);
                    if(models.length) {
                        /*models.forEach(m => {
                            this.sassOptions.clean(m.id);
                        });*/
                        let paths = models.map(m=>m.toJSON().path).join(', ');

                        return this.renderMaster.add({
                            description: `Assembly pages: ${paths}`,
                            models
                        });
                    }
                }
            }
        });
        this.renderMaster = new renderMaster(_.extend(config.render, {
            id: this.id
        }), this._render.bind(this));
        this.renderMaster.on('log', (type, message) => {
            if(this.project.config.verbose) {
                this.log(message, type);
            }
        });
        this.ungicParser.add('pipe', async (attributes, args, body) => {
            let attrs = {
                dir: ("dir" in attributes && ['ltr', 'rtl'].indexOf(attributes.dir) != -1) ? attributes.dir : ''
            }
            let config = this.config;
            if("css" in attributes) {
                attrs.css = attributes.css.split(',').map(e=>e.replace(/^\s+|\s+$/, ''));
            }
            if("release" in attributes) {
                attrs.release = attributes.release;
            }
            args.pipe = attrs;
            let output = '';

            if(attrs.css) {
                for(let css of attrs.css) {
                    if(path.extname(css) != '') {
                        css = path.basename(css, path.extname(css));
                    }
                    let pathToCSS = path.join(this.dist, config.fs.dist.css, css + (['ltr', 'rtl'].indexOf(attrs.dir) == -1 ? '' : '.' + attrs.dir) + '.css');
                    let href = '/' + path.relative(this.project.root, pathToCSS).replace(/\\+/g, '/');
                        if(!config.relative_src) {
                            href = this.project.fastify.address + href.replace(/\\+/g, '/');
                        }
                        output += `<link rel="stylesheet" href="${href}" />`;

                    if(!await fsp.exists(pathToCSS)) {
                        let entity = args.path ? args.path : args.id;
                        this.log(`css file by path ${pathToCSS} not exist.`, 'warning');
                    }
                }
            }
            return output;
        });

        this.on('watcher:'+ config.fs.dirs.source + ':' +config.fs[config.fs.dirs.source].html, (event, ph, stat) => {
            let availableTypes = _.keys(config.supported_types).map(type => '.' + type);
            if(availableTypes.indexOf(path.extname(ph)) != -1) {
                this.setEntityByPath(event, path.relative(this.root, ph));
            }
        });
        this.on('watcher:' + config.fs.dirs.dist, (event, ph, stat) => {
            this._dist_handler(event, path.relative(this.dist, ph));
        });
        Handlebars.registerHelper("debug", function() {
            return '<pre>' + JSON.stringify(this, null, 4) + '</pre>';
        });
        Handlebars.registerHelper("source", function() {
            return JSON.stringify(this, null, 4);
        });
        Handlebars.registerHelper("src", (src, context) => {
            let rootData = context.data.root.ungic;
            let config = this.config;
            let options = context.hash ? context.hash: {};
            let cwd = options.cwd ? path.join(this.dist, options.cwd) : this.dist;
            let pathToSRC = path.join(cwd, src);
            let relative_src = options.relative_src ? options.relative_src : config.relative_src;

            let page_ids = [];
            if(this.resources.has(pathToSRC)) {
                page_ids = this.resources.get(pathToSRC);
            }
            page_ids.push(rootData.page.id);
            this.resources.set(path.relative(this.dist, pathToSRC), page_ids);
            if(!fs.existsSync(pathToSRC)) {
                this.log(`Resource by path ${pathToSRC} not exist`);
            }
            if(relative_src) {
                return this.project.fastify.address + '/' + path.relative(this.project.root, pathToSRC).replace(/\\+/g, '/');
            } else {
                return '/' + path.relative(this.project.root, pathToSRC).replace(/\\+/g, '/');
            }
        });
        Handlebars.registerHelper("log", function() {
            console.log(JSON.stringify(this, null, 4));
            return '';
        });
        Handlebars.registerHelper('raw', function(options) {
            return options.fn();
        });
        Handlebars.registerHelper('include', (template, context) => {
            let rootData = context.data.root;
            let source = {ungic: _.clone(rootData.ungic)};
            let activeModel = this.collection.findByID(source.ungic.model ? source.ungic.model.id : source.ungic.page.id);

            let options = context.hash ? context.hash: {};
            let dirname = source.ungic.dirname ? source.ungic.dirname : path.dirname(source.ungic.page.path);
            let cwd = config.relative_include ? path.join(this.root, dirname) : this.root;
            if(options.cwd) {
                cwd = path.join(this.root, options.cwd);
            }
            if(options.data) {
                let dataPath = path.join(cwd, options.data);
                if(!fs.existsSync(dataPath)) {
                    this.log(`Data file by path ${dataPath} not exists. Error building ${rootData.ungic.page.path} page in ${activeModel.get('path')} entity`, 'error');
                } else {
                    let model = this.collection.findWhere({path: path.relative(this.root, dataPath)}, false);
                    if(model) {
                        if(_.keys(rootData).length == 1 || (options.extend === 'true' || options.extend === true)) {
                            source = _.extend(rootData, model.get('body'));
                        } else {
                            source = _.extend(source, model.get('body'));
                        }
                        let page_ids = [];
                        if(model.has('page_ids')) {
                            page_ids = model.get('page_ids');
                        }
                        page_ids.push(rootData.ungic.page.id);
                        model.set('page_ids', page_ids, {silent: true});
                    }
                }
            }
            let templatePath = path.join(cwd, template);
            let content = '';
            if(!fs.existsSync(templatePath)) {
                this.log(`File by path ${templatePath} not exists. Error building ${rootData.ungic.page.path} page`, 'error');
            } else {
                let model = this.collection.findWhere({path: path.relative(this.root, templatePath)}, false);
                if(model) {
                    if(activeModel.get('type') == 'template' && model.get('type') != 'template') {
                        return this.log(`Templates can include only templates. Error building ${rootData.ungic.page.path} page in ${activeModel.get('path')} entity`, 'error');
                    }
                    let supported_types = config.supported_types;
                    let supported_include_types = config.supported_include_types;
                    supported_include_types = supported_include_types.map(type => supported_types[type]);
                    if(supported_include_types.indexOf(model.get('type')) == -1) {
                        return this.log(`${model.get('type')} type not supported for including. Error building ${rootData.ungic.page.path} page in ${activeModel.get('path')} entity`, 'error');
                    }
                    source.ungic.dirname = path.dirname(path.relative(this.root, templatePath));
                    source.ungic.model = {
                        id: model.id,
                        path: model.get('path')
                    }
                    content = model.get('body');
                    let page_ids = [];
                    if(model.has('page_ids')) {
                        page_ids = model.get('page_ids');
                    }
                    page_ids.push(rootData.ungic.page.id);
                    model.set('page_ids', page_ids, {silent: true});

                    let sass;
                    if(options.sass) {
                        sass = {};
                        let scssPlugin = this.project.plugins.get('scss');
                        let exportSearch = function(str) {
                            let spl = str.split('.');
                            let data;
                            let search = function(id, data) {
                                let res = scssPlugin.exports.find(model => model.id.indexOf(id) == 0);
                                if(res) {
                                    res = res.toJSON();
                                    if(!spl.length) {
                                        return res;
                                    }
                                    return search(id + '.' + spl.shift(), res);
                                } else {
                                    if(!spl.length) {
                                        return data;
                                    } else {
                                        return search(id + '.' + spl.shift(), res);
                                    }
                                }
                            }
                            if(spl.length) {
                                data = search(spl.shift());
                            }
                            return data;
                        }
                        let sass_options = options.sass.replace(/\s/g, '').split(',');
                        if(scssPlugin && scssPlugin.exports.size) {
                            for(let o of sass_options) {
                                let res = exportSearch(o);
                                if(res) {
                                    sass[res.id] = res.data;
                                    this.sassOptions.set(res.id, rootData.ungic.page.id);
                                }
                            }
                        }
                        source.sass = sass;
                    }
                    if(model.get('type') == 'template') {
                        if('object' == typeof options.extend) {
                            source = _.extend(source, options.extend);
                        }
                        if(options.inline) {
                            let inlineData = {}
                            try {
                                inlineData = queryString.parse(options.inline);
                            } catch(e) {
                                this.log(e);
                            }
                            source = _.extend(source, inlineData);
                        }
                        content = Handlebars.compile(content)(source);
                    }
                    if(model.get('type') == 'part') {
                        let s = {
                            ungic: source.ungic
                        }
                        if(sass) {
                            s.sass = source.sass;
                        }
                        content = Handlebars.compile(content)(s);
                    }
                    if(model.get('type') == 'page') {
                        this.log(`${model.get('path')} page cannot be included in the ${rootData.ungic.page.path} page! The page cannot be included in the page!`);
                        content = '';
                    }
                } else {
                    this.log(`${templatePath} file type is not supported and cannot be included in the project!`, 'warning');
                }
            }
            return content;
        });
    }
    _idbypath(path) {
        return Buffer.from(path).toString('base64');
    }
    async _attrHandler(attrs) {
        let config = this.config;
        if(attrs.path) {
            attrs.id = this._idbypath(attrs.path);
        }
        let handlerID = attrs.extname;
        if(handlerID.indexOf('.') != 0) {
            return
        }
        handlerID = handlerID.replace('.', '');
        let availableTypes = _.keys(config.supported_types);
        if(availableTypes.indexOf(handlerID) == -1) {
            return
        }
        attrs.type = config.supported_types[handlerID];
        if(this.typeHandlers.has(handlerID)) {
            attrs = await this.typeHandlers.get(handlerID).call(this, attrs);
        }
        if(!attrs) {
            return;
        }
        return attrs;
    }

    async setEntityByPath(event, ph, options={}) {
        ph = path.normalize(ph);
        let entityData = {
            extname: path.extname(ph).toLowerCase(),
            path: ph
        }
        let fullPath = path.join(this.root, ph);
        if(!await fsp.exists(fullPath)) {
            let model = this.collection.find(model=>model.get().path == ph);
            if(model) {
                this.collection.remove(model.id);
            }
            return;
        }
        let body;
        try {
            body = await fsp.readFile(fullPath, 'UTF-8');
        } catch(e) {
            this.log(e);
        }
        entityData.body = body;
        await this.collection.add(entityData, options);
    }
    async _render(events) {
        let config = this.config;
        let prjConfig = this.project.config;
        let source = {
            fs: config.fs,
            project: {
                name: prjConfig.name,
                version: prjConfig.version,
                author: prjConfig.author
            }
        }
        for(let event of events) {
            for(let model of event.models) {
                let attrs = model.get();
                this.sassOptions.clean(model.id);
                source = _.extend(source, {
                    page: {
                        id: model.id,
                        path: attrs.path
                    }
                });
                let output;
                try {
                    output = Handlebars.compile(attrs.body)({
                        ungic: source
                    });
                    if(config.pretty) {
                        output = pretty(output);
                    }
                } catch(e) {
                    this.log(`An error occurred while rendering the ${attrs.path} page. Origin: ${e.message}`, 'error');
                }
                let distPath = path.join(this.dist, attrs.path);
                await fse.outputFile(distPath, output);
                this.log(`${attrs.path} page successfully compiled to ${distPath}`);
            }
        }

        this.emit('ready', events);
    }
    _dist_handler(event, ph) {
        if(this.resources.has(ph)) {
            let page_ids = this.resources.get(ph);

            let models = this.collection.filter(model => page_ids.indexOf(model.id) != -1);
            if(models.length) {
                let paths = models.map(m=>m.toJSON().path).join(', ');
                let projectConfig = this.project.config;
                if(projectConfig.verbose) {
                    this.log(`Dependent resource by path ${ph} has been changed. It used in ${paths} pages.`);
                }
                // send event for update this pages
/*                return this.renderMaster.add({
                    description: `${paths} pages`,
                    models
                });*/
            }
            if(!fs.existsSync(ph)) {
                this.resources.delete(ph);
            }
        }
    }
    async initialize() {
        let config = this.config;
        let types = _.keys(config.supported_types).join('|');
        let files = await fg('**/*.('+types+')', {dot: false, cwd: this.root, deep: 10});
        for(let file of files) {
            await this.setEntityByPath('add', file, {silent: true});
        }

        let models = this.collection.findAllWhere({type: 'page'}, false);

        if(Array.isArray(models) && !models.length || !models) {
            return;
        }
        let pages = models.map(model=>model.toJSON());

        this.renderMaster.add({
            description: `assembly pages: ${_.pluck(pages, 'path').join(', ')}`,
            models
        });
    }
    async begin() {
        await this.renderMaster.run();
        let scssPlugin = this.project.plugins.get('scss');
        scssPlugin.on('exports', (event, model) => {
            let storage = this.sassOptions.storage;
            let expOptions = _.filter(storage, e => e.eid == model.get('id'));
            if(expOptions.length) {
                let models = this.collection.filter(model => _.find(expOptions, e => e.page_id == model.id));
                if(models.length) {
                    let pages = models.map(model=>model.toJSON());
                    this.renderMaster.add({
                        description: `assembly pages: ${_.pluck(pages, 'path').join(', ')}`,
                        models: models
                    });
                }
            }
        });
    }
}

module.exports = htmlPlugin;

