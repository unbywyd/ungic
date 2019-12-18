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
const Storage = require('../../modules/storage');
const skeleton = require('../../modules/skeleton');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const MD = new(require('markdown-it'));
const yaml = require('js-yaml');
const validate = require('html5-validator');
var amphtmlValidator = require('amphtml-validator');
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

class htmlPlugin extends plugin {
    constructor(config={}, sysconfig={}) {
        config.id = 'html';
        super(require('./model-scheme'), config, sysconfig);
        this.iconsStorage = {};
        this.ungicParser = new(require('./utils/parser'));
        this.resources = new Map;
        this.typeHandlers = new typeHandlers;
        this.typeHandlers.set('md', async attrs => {
            attrs.source = attrs.body;
            attrs.body = MD.render(attrs.body);
            return attrs;
        });

        this.sassUsed = new Storage;
        this.iconsUsed = new Storage;
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
            if(!dom.window.document.querySelector('head').children.length && dom.window.document.querySelector('body').innerHTML.replace(/\s/g, '') != '') {
                attrs.body = dom.window.document.querySelector('body').innerHTML;
            } else if (dom.window.document.querySelector('html').innerHTML.replace(/\s/g, '') != '') {
                attrs.type = "page";
                if(!this.release) {
                    let script = dom.window.document.createElement("script");
                    script.setAttribute('src', this.project.fastify.address + '/ungic/js/dist/pipe.min.js');
                    script.setAttribute('data-connect', this.project.fastify.address);
                    script.setAttribute('data-src', path.relative(this.dist, path.join(this.dist, attrs.path)).replace(/\\+/g, '/'));
                    dom.window.document.querySelector('body').appendChild(script);

                    if(this.iconsStorage.fonts && this.iconsStorage.fonts.data.icons.length) {
                        let linkicons = dom.window.document.createElement("link");
                        linkicons.setAttribute('href', this.project.fastify.address + '/ungic/font-icons');
                        linkicons.setAttribute('rel', 'stylesheet');
                        dom.window.document.querySelector('head').appendChild(linkicons);
                    }
                }

                if(this.iconsStorage.svg_sprite  && this.iconsStorage.svg_sprite.data.icons.length && !this.iconsStorage.svg_sprite.data.external) {
                    let domSprite = new JSDOM(this.iconsStorage.svg_sprite.data.sprite);
                    dom.window.document.querySelector('body').appendChild(domSprite.window.document.querySelector('svg'));
                }
                attrs.body = '<!DOCTYPE html>\n' + dom.window.document.documentElement.outerHTML;
                if(dom.window.document.querySelector('html').hasAttribute('⚡')) {
                    attrs.amp = true;
                }
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
                this.sassUsed.clean(m => m.page_id == model.id);
                this.iconsUsed.clean(m => m.page_id == model.id);
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
                    let href = '/' + path.relative(this.dist, pathToCSS).replace(/\\+/g, '/');
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

            if(this.release) {
                let host = this.release.host;
                if(!/\/$/.test(host)) {
                    host += '/';
                }
                return host + path.relative(this.dist, pathToSRC).replace(/\\+/g, '/');
            }

            if(!relative_src) {
                return this.project.fastify.address + '/' + path.relative(this.dist, pathToSRC).replace(/\\+/g, '/');
            } else {
                return '/' + path.relative(this.dist, pathToSRC).replace(/\\+/g, '/');
            }
        });
        Handlebars.registerHelper("icon", (id, context) => {
            let rootData = context.data.root.ungic;
            let options = context.hash ? context.hash: {};
            let config = this.config;
            let type = options.type;
            if(!type) {
                this.error('<type> argument is required');
                return '';
            }
            if(!this.iconsStorage[type]) {
                this.error(`Icon plugin does not generate ${type} type of icon`);
                return '';
            }
            if(!this.iconsStorage[type].data.icons.length) {
                this.error('The icons plugin did not generate any icons');
                return '';
            }

            let icon = _.find(this.iconsStorage[type].data.icons, {id});
            if(!icon) {
                this.warning(`${id} icon not exists`);
                this.iconsUsed.set({icon_id: id, page_id: rootData.page.id, type, rendered: false});
                return '';
            }
            let iconsPlugin = this.project.plugins.get('icons');
            let iconRendered = iconsPlugin.getIconForRender(icon.id, options);
            if(iconRendered) {
                this.iconsUsed.set({icon_id: id, page_id: rootData.page.id, type, rendered: true});
                return iconRendered;
            }
            return '';
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
                if(options.data == 'icons') {
                    let iconsData = {};
                    if(this.iconsStorage.fonts) {
                        iconsData.fonts = _.map(this.iconsStorage.fonts.data.icons, i => _.omit(i, 'svg'));
                    }
                    if(this.iconsStorage.svg_sprite) {
                        iconsData.svg_sprite = _.map(this.iconsStorage.svg_sprite.data.icons, i => _.omit(i, 'svg'));
                    }
                    source.icons = iconsData;
                } else {
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
                                let res = scssPlugin.exports.chain().filter(model => model.id.indexOf(id) == 0).map(m => m.toJSON()).value();
                                if(res.length) {
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
                        if(scssPlugin && scssPlugin.exports.size()) {
                            for(let o of sass_options) {

                                let res = exportSearch(o);
                                if(res.length) {
                                    for(let r of res) {
                                        sass[r.id] = r.data;
                                        this.sassUsed.set(r.id, rootData.ungic.page.id);
                                    }
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
            path: path.normalize(ph)
        }
        let fullPath = path.join(this.root, ph);
        if(!await fsp.exists(fullPath)) {
            let model = this.collection.find(model=>model.get('path') == path.normalize(ph));
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
    toRelease(args) {
        return new Promise(async(done, rej) => {
            this.release = args;
            this.unwatch();
            if(!args.pages.length) {
                this.error('no pages selected for release compilation');
                return;
            }

            let pagesModels = this.collection.filter(model => args.pages.indexOf(model.get('path')) != -1);
            let pids = _.map(pagesModels, m => m.id);

            let models = this.collection.filter(model => {
                if(model.has('page_ids') && model.get('page_ids').length) {
                    let page_ids = model.get('page_ids');
                    for(let pid of page_ids) {
                        if(pids.indexOf(pid) != -1) {
                            return true;
                        }
                    }
                }
                if(args.pages.indexOf(model.get('path')) != -1) {
                    return true;
                }
            });
            for(let model of models) {
                let ph = model.get('path');
                this.collection.remove(model, {silent: true});
                await this.setEntityByPath('add', ph, {silent: true});
            }
            let pages = pagesModels.map(model=>model.toJSON());
            let self = this;
            async function ready(events) {
                self.watch();
                delete self.release;
                for(let model of models) {
                    let ph = model.get('path');
                    self.collection.remove(model, {silent: true});
                    await self.setEntityByPath('add', ph, {silent: true});
                }
                self.off('ready', ready);
                done();
            }

            this.on('ready', ready);
            this.renderMaster.add({
                description: `assembly pages: ${_.pluck(pages, 'path').join(', ')}`,
                models: this.collection.filter(model => args.pages.indexOf(model.get('path')) != -1)
            });
        });
    }
    async validate(content, name) {
        name = name ? name : 'This';
        try {
            let result = await validate(content);

            if(result.messages.length) {
                let res =  `${name} document has ${result.messages.length} validation errors:`;
                for(let i=0; i<result.messages.length; i++) {
                    let m = result.messages[i];
                    res += `\n${i+1}) ` + m.message;
                    let fl = m.firstLine ? m.firstLine : 1;
                    res += "\n" + `From line ${fl}, column ${m.firstColumn}; to line ${m.lastLine}, column ${m.lastColumn}`
                }
                return res;
            }
            return name+ ' document is valid according to the specified schema';
        } catch(e) {
            this.log(e);
        }
    }
    async ampValidate(content, name) {
        name = name ? name : 'This';
        try {
            let validator = await amphtmlValidator.getInstance();
            var result = validator.validateString(content);
            if(result.status  === 'PASS') {
                return 'PASS';
            } else {
                let res =  `${name} document has ${result.errors.length} amp validation errors:`;
                for(let i=0; i<result.errors.length; i++) {
                    let m = result.errors[i];
                    res += `\n${i+1}) ` + m.severity;
                    res += "\n" + m.message;
                    res += "\n" + `Line ${m.line}, column ${m.col}, code: ${m.code}, specUrl ${m.specUrl};`;
                }
                return res;
            }
        } catch(e) {
            this.log(e);
        }
    }
    async distValidate(ph) {
        let pathDist = path.join(this.dist, ph);
        if(!await fsp.exists(pathDist)) {
            if(await fsp.exists(pathDist + '.html')) {
                pathDist = pathDist + '.html';
            } else {
                throw new Error(`${pathDist} not exist`);
            }
        }
        let content = await fsp.readFile(pathDist, 'UTF-8');
        return this.validate(content, path.basename(pathDist));
    }
    async distAmpValidate(ph) {
        let pathDist = path.join(this.dist, ph);
        if(!await fsp.exists(pathDist)) {
            if(await fsp.exists(pathDist + '.html')) {
                pathDist = pathDist + '.html';
            } else {
                throw new Error(`${pathDist} not exist`);
            }
        }
        let content = await fsp.readFile(pathDist, 'UTF-8');
        return this.ampValidate(content, path.basename(pathDist));
    }
    async removePage(name) {
        if(path.extname(name) != '') {
            name = path.basename(name, path.extname(name));
        }
        let rootPath =  path.join(this.root, name + '.html');
        if(!await fsp.exists(rootPath)) {
           throw new Error(`${name} page not exist!`);
        }
        return fse.remove(rootPath);
    }
    async createPage(args) {
        let name = args.name;
        let template = path.join(__dirname, 'page.hbs');
        template = await fsp.readFile(template, 'UTF-8');
        if(path.extname(name) != '') {
            name = path.basename(name, path.extname(name));
        }
        let rootPath = path.join(this.root, name + '.html');
        if(await fsp.exists(rootPath)) {
           throw new Error(`${name} page already exist!`);
        }
        return fse.outputFile(rootPath, Handlebars.compile(template)(args));
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
                    console.log(e);
                    this.log(`An error occurred while rendering the ${attrs.path} page. Origin: ${e.message}`, 'error');
                }
                let distPath = this.dist;
                if(this.release) {
                    distPath = path.join(this.dist, 'releases', this.release.name + '.' + this.release.version);
                    if(config.release_validation) {
                        if(attrs.amp) {
                            let resultValidation = await this.ampValidate(output, attrs.path);
                            await fse.outputFile(path.join(distPath, path.basename(attrs.path, path.extname(attrs.path)) + '.amp.validation.result.txt'), resultValidation);
                        } else {
                            let resultValidation = await this.validate(output, attrs.path);
                            await fse.outputFile(path.join(distPath, path.basename(attrs.path, path.extname(attrs.path)) + '.w3.validation.result.txt'), resultValidation);
                        }
                    }
                    let templatesModels = this.collection.filter(m => m.has('page_ids') && m.get('page_ids').indexOf(model.id) != -1 && m.get('type') == 'template');
                    if(templatesModels.length) {
                        for(let template of templatesModels) {
                            let output = template.get('body');
                            let templatePath = path.join(distPath, 'templates', template.get('path'));
                            if(/^templates/.test(template.get('path'))) {
                                templatePath = path.join(distPath, template.get('path'));
                            }
                            await fse.outputFile(templatePath, output);
                        }
                    }
                } else {
                    if(config.dev_validation) {
                        if(attrs.amp) {
                            await this.ampValidate(output, attrs.path);
                        } else {
                            await this.validate(output, attrs.path);
                        }
                    }
                }
                distPath = path.join(distPath, attrs.path);
                await fse.outputFile(distPath, output);
                this.log(`${attrs.path} page successfully compiled to ${distPath}`);
                this.emit('one_ready', attrs);
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

    }
    async begin(options) {
        if(options.icons) {
            this.iconsStorage = options.icons;
        }
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
        await this.renderMaster.run();
        let scssPlugin = this.project.plugins.get('scss');
        scssPlugin.on('exports', (event, model) => {
            let storage = this.sassUsed.storage;
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
        this.project.on('icons', e => {
            this.iconsStorage[e.type] = e;
            let ids = _.map(e.data.icons, i => i.id);
            let used = _.filter(this.iconsUsed.storage, i => ids.indexOf(i.icon_id) != -1);
            if(used.length) {
                let page_ids = _.uniq(_.map(used, i => i.page_id));
                let models = this.collection.filter(m => page_ids.indexOf(m.id) != -1);
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

