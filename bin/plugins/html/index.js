const plugin = require('../');
const fg = require('fast-glob');
const fs = require('fs');
const url = require('url');
const fsp = fs.promises;
const fse = require('fs-extra');
const beautify = require('js-beautify');
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
const isRelative = require('../../modules/is-relative');
const srcReplacer = require('../../modules/postcss-src-replacer');
const MD = new(require('markdown-it'));
const yaml = require('js-yaml');
const validate = require('html5-validator');
const amphtmlValidator = require('amphtml-validator');
//const pug = require('pug');
const minify = require('html-minifier').minify;
const cheerio = require('cheerio');
const appPaths = require('../../modules/app-paths')();
const postcss = require('postcss');
const clean = require('../../modules/postcss-clean');
const Stream = require('stream');
const terser = require('terser');
const babelify = require('babelify');
const browserify = require('browserify');
const sass = require('sass');

const systemConfig = require('./system-config');
class builder extends skeleton {
    constructor(scheme, config={}) {
        super(scheme, {objectMerge: true}, config);
    }
}

let jsOptimaze = (source) => {
    return new Promise((res, rej) => {
        var vFile = new Stream.Readable();
        if(Array.isArray(source)) {
            source = source.join(' ');
        }
        vFile.push(source, 'utf8')
        vFile.push(null);

        let brow = browserify([vFile], {
            basedir: __dirname,
            paths: [appPaths.root]
        });   
        
        brow.transform(babelify.configure({
            cwd: __dirname,
            presets: [['@babel/preset-env', {
                corejs: 3,
                useBuiltIns: 'entry'
            }]],
            plugins: [["@babel/plugin-transform-runtime", {
                regenerator: true
            }]]
        }));

        brow.on("error", function (err) {
            rej(err);
        });

        brow.bundle(function(err, data) {
            if(err) {
                return rej(err);
            }
            try {
                //console.log(output);
                let output = terser.minify(data.toString(), {
                    toplevel: true,
                    mangle: {
                      toplevel: true,
                    },
                    output: {comments: false}
                });
                res(output.code);
            } catch(e) {
                return rej(e);
            }
        });
    });
}



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

let getDeepEl = (str, data) => {
    let spl = str.split(/(?<!\\)\./);
    spl = _.map(spl, e => e.replace(/\\./g, '.'));
    let search = function(key, data) {
        let sub = data[key];
        if(sub || !spl.length) {
            if(!spl.length) {
                return sub;
            }
            return search(spl.shift(), sub);
        } else {
            return data;
        }
    }
    if(spl.length) {
        data = search(spl.shift(), data);
    }
    return data;
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
        this.pipes = new Storage;
        this.mainScssPipes = new Storage;
        this.iconsUsed = new Storage;
        this.iconsDataUsed = new Storage;
        this.slotsStorage = new Storage;
        this.customTypeStorage = new Storage;

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
            let body = attrs.body, sourceBody = body;
            body = body.replace(/<!-{1,}[\w\W]+?-{2,}>/gm, '');
            if(((/(?<!(<\!--\s*))<html/gi.test(body) && /<\/html>(?!(\s*-->))/gi.test(body)) || /UNGIC\:PAGE/i.test(sourceBody)) && !/UNGIC\:PART/i.test(sourceBody)) { // || (/<body/g.test(body) && /<\/body/g.test(body))
                attrs.type = 'page';
                if(/<html\s+.+\s(amp|⚡)\s?.*>/g.test(attrs.body)) {
                    attrs.amp = true;
                }
            }
            return attrs;
        });

        config = this.config;

        if(typeof this.config.customTypeHandlers == 'object') {
            for(let type in this.config.customTypeHandlers) {
                let pathToScript = path.join(appPaths.root, this.config.customTypeHandlers[type].transformer);
                try {
                    if(_.keys(systemConfig.supportedTypes).includes(type)) {
                        throw new Error(`${type} type already exists!`);
                    }
                    if(_.values(systemConfig.supportedTypes).includes(type)) {
                        throw new Error(`${type} type already system reserved!`);
                    }
                    let handler = require(pathToScript);
                           
                    if (typeof handler != "function") {
                        throw new Error("transformer for custom type should return a async function");
                    } else {
                        let data = {
                            type,
                            transformer: handler,
                            dev: !!this.config.customTypeHandlers[type].dev
                        }
                        if(typeof this.config.customTypeHandlers[type].includeHandler == 'string') {
                            let includeHandlerPath = path.join(appPaths.root, this.config.customTypeHandlers[type].includeHandler);
                            if(path.extname(includeHandlerPath) == "") {
                                includeHandlerPath = includeHandlerPath + '.js';
                            }
                            let includeHandler = require(includeHandlerPath);
                            if (typeof includeHandler != "function") {
                                throw new Error("includeHandler for custom type should return a function");
                            } else {
                                data.includeHandler = includeHandlerPath
                            }                            
                        } else if(typeof this.config.customTypeHandlers[type].includeHandler === "boolean") {
                            data.includeHandler = this.config.customTypeHandlers[type].includeHandler;
                        } else {
                            data.includeHandler = true;
                        }
                        this.customTypeStorage.set(data);
                    }
                } catch(e) {       
                    let errorMessage = () => {
                        this.error(`Custom ${type} File Type Handler Error: ${e.message}`);
                        this.off('rendered', errorMessage);
                    }                    
                    this.on('rendered', errorMessage);                             
                }
            }
        }
        
        if(this.customTypeStorage.storage.length) {
            systemConfig.supportedIncludeTypes =  _.uniq(systemConfig.supportedIncludeTypes.concat(_.pluck(this.customTypeStorage.storage, "type")));
            let types = {};
            for(let type of this.customTypeStorage.storage) {
                types[type.type] = type.type;
                let message = () => {
                    this.log(`${type.type} custom file handler has been successfully added to HTML plugin, you can use *.${type.type} files.`, "success");
                    this.off('rendered', message);
                }                   
                this.on('rendered', message);               
                this.typeHandlers.set(type.type, type.transformer);
            }
            systemConfig.supportedTypes =  _.extend(systemConfig.supportedTypes, types);
        }

        let enums = _.uniq(_.values(systemConfig.supportedTypes));
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
                this.iconsDataUsed.clean(m => m.page_id == model.id);

                if(event == 'removed') {
                    if(model.get('type') == 'page') {
                        if(config.deleteFromDist) {
                            fse.remove(path.join(this.dist, model.get('path')));
                        }
                        return;
                    }
                    this.slotsStorage.clean(r => r.htmlModelId == model.id); 
                    this.pipes.clean(m => m.page_id == model.id);
                    this.mainScssPipes.clean(m => m.page_id == model.id);
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
            let pipes = _.findWhere(this.pipes.storage, {page_id: args.id});
        
            if(pipes) {
                return
            }
            try {
                let attrs = {
                    dir: ("dir" in attributes && ['ltr', 'rtl'].indexOf(attributes.dir) != -1) ? attributes.dir : ''
                }
                let config = this.config;
               
                if("sass" in attributes && attributes.sass.trim() != '') {
                    attrs.css = attributes.sass;
                    attributes.css = attributes.sass;
                }
                let output = '';

                if("main" in attributes) {
                    this.mainScssPipes.set({
                        page_id: args.id,
                        main: attributes['main']                 
                    });
                    output += `<!-- app:${attributes['main']} -->`;
                }
                
                if("css" in attributes && attributes.css.trim() != '') {
                    attrs.css = attributes.css.split(',').map(e=>e.replace(/^\s+|\s+$/, ''));
                }           

                attrs.css = _.reject(attrs.css, e => e.trim() == '');
                if("release" in attributes) {
                    attrs.release = attributes.release;
                }                
                args.pipe = attrs;              
                if(attrs.css && attrs.css.length) {
                    this.pipes.set({
                        page_id: args.id,
                        css: attrs.css                       
                    });
                    for(let css of attrs.css) {
                        if(path.extname(css) != '') {
                            css = path.basename(css, path.extname(css));
                        }
                        let pathToCSS = path.join(this.dist, config.fs.dist.css, css + (['ltr', 'rtl'].indexOf(attrs.dir) == -1 ? '' : '.' + attrs.dir) + '.css');
                        let href = '/' + path.relative(this.dist, pathToCSS).replace(/\\+/g, '/');
                        if(!config.relativeSrc) {
                            href = this.project.fastify.address + href.replace(/\\+/g, '/');
                        }
                        if(!this.release) {
                            output += `<link rel="stylesheet" data-component="${css}" href="${href}?v=${Date.now()}" />`;
                        }
                    }
                }
                return output;
            } catch(e) {
                console.log(e);
            }
        });

        this.on('watcher:'+ config.fs.dirs.source + ':' +config.fs.source.html, (event, ph, stat) => {
            let availableTypes = _.keys(systemConfig.supportedTypes).map(type => '.' + type);
            if(availableTypes.indexOf(path.extname(ph)) != -1) {
                this.setEntityByPath(event, path.relative(this.root, ph));
            }
        });
        this.on('watcher:' + config.fs.dirs.dist, (event, ph, stat) => {
            this._dist_handler(event, path.relative(this.dist, ph));
        });
        let self = this;
        /*this.MustacheHelpers = {
            debug_it: function() {
                return function(searchBy) {
                    if(self.release) {
                        return '';
                    }
                    let data = this;
                    if(searchBy) {
                        data = getDeepEl(searchBy, data);
                    }
                    return '<div dir="ltr"><pre dir="ltr" data-path="'+this.ungic.model.path+'" class="un-debug">' + JSON.stringify(data, null, 4) + '</pre></div>';
                }
            },
            debug: function() {
                if(self.release) {
                    return '';
                }
                return '<div dir="ltr"><pre dir="ltr" data-path="'+this.ungic.model.path+'" class="un-debug">' + JSON.stringify(this, null, 4) + '</pre></div>';
            },
            debug_source: function() {
                if(self.release) {
                    return '';
                }
                return JSON.stringify(this, null, 4);
            }
        }*/
        Handlebars.registerHelper("debug", function(searchBy) {
            if(self.release) {
                return '';
            }
            let data = this;

            if('string' == typeof searchBy) {
                data = getDeepEl(searchBy, data);
            }
            //console.log(this);
            return '<div dir="ltr"><pre dir="ltr" data-path="'+this.ungic.model.path+'" class="un-debug">' + JSON.stringify(data, null, 4) + '</pre></div>';
        });
        Handlebars.registerHelper("debug_source", function() {
            if(self.release) {
                return '';
            }
            return JSON.stringify(this, null, 4);
        });
        Handlebars.registerHelper("src", (src, context) => {
            let rootData = context.data.root.ungic;
            let config = this.config;
            let options = context.hash ? context.hash: {};
            let cwd = options.cwd ? path.join(this.dist, options.cwd) : this.dist;
            let pathToSRC = path.join(cwd, src);
            let relativeSrc = options.relativeSrc ? options.relativeSrc : config.relativeSrc;
            let page_ids = [];
            if(this.resources.has(pathToSRC)) {
                page_ids = this.resources.get(pathToSRC);
            }
            page_ids.push(rootData.page.id);
            this.resources.set(path.relative(this.dist, pathToSRC), page_ids);
            if(!fs.existsSync(pathToSRC)) {
                this.log(`Resource by path ${pathToSRC} not exist. Required for ${rootData.page.path} page`, 'warning');
            }
            if(this.release) {
                let host = this.release.host;

                let distRelative = path.relative(this.dist, pathToSRC);
                let distPath = path.join(this.dist, 'releases', this.release.releaseName + '-v' + this.release.version);
                let pathToRelease = path.join(distPath, distRelative);
                if(!fs.existsSync(pathToRelease) && fs.existsSync(pathToSRC)) {
                    fse.copySync(pathToSRC, pathToRelease);
                }

                if(!isRelative(host)) {
                    return url.resolve(host, path.relative(this.dist, pathToSRC));
                } else {
                    return '/' + path.relative(this.dist, pathToSRC).replace(/\\+/g, '/');
                }
            }
            if(!relativeSrc) {
                return this.project.fastify.address + '/' + path.relative(this.dist, pathToSRC).replace(/\\+/g, '/');
            } else {
                return '/' + path.relative(this.dist, pathToSRC).replace(/\\+/g, '/');
            }
        });
        Handlebars.registerHelper("icon", (id, context) => {
            let rootData = context.data.root.ungic;
            let options = context.hash ? context.hash: {};
            let config = this.config;
            if(!_.keys(this.iconsStorage).length) {
               this.error(`Icon plugin did not generate any icons`);
            }
            let iconsPlugin = this.project.plugins.get('icons');
            if(!iconsPlugin.hasIcon({id})) {
                this.error(id + ' icon does not exist or it was not generated');
                this.iconsUsed.set({icon_id: id, page_id: rootData.page.id, rendered: false});
                return '';
            }

            options.relativeSrc = config.relativeSrc;
            let iconRendered = iconsPlugin.getIconForRender(id, options);
            if(iconRendered) {
                this.iconsUsed.set({icon_id: id, page_id: rootData.page.id, rendered: true});
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
            source.ungic.UID = '_' + Math.random().toString(36).substr(2, 9);
            let pageModel = this.collection.findByID(source.ungic.page.id); // source.ungic.model ? source.ungic.model.id : 

            let options = context.hash ? context.hash: {};
            //let dirname = source.ungic.dirname ? source.ungic.dirname : path.dirname(source.ungic.page.path);
            let cwd = this.root; // config.relative_include ? path.join(this.root, dirname) :

           let handlebarsCompile = (content, source) => {
                try {
                    content = Handlebars.compile(content)(source);
                } catch(e) {
                    this.log(`Handlebars compile error: ${e.message}. Error while assembling ${rootData.ungic.page.path} page`, 'error');
                }
                return content;
            }

            if(options.cwd) {
                cwd = path.join(this.root, options.cwd);
            }
            if(options.move === 'true' || options.move === true) {
                source = _.extend({}, rootData, source);
            }
            if(options.data) {
                if(options.data == 'icons') {
                    this.iconsDataUsed.set({page_id: source.ungic.page.id});
                    let iconsData = {};
                    if('object' == typeof this.iconsStorage.fonts && this.iconsStorage.fonts.data) {
                        iconsData.fonts = _.map(this.iconsStorage.fonts.data.icons, i => _.omit(i, 'svg'));
                    }
                    if('object' == typeof this.iconsStorage.svgSprite && this.iconsStorage.svgSprite.data) {
                        iconsData.svgSprite = _.map(this.iconsStorage.svgSprite.data.icons, i => _.omit(i, 'svg'));
                    }
                    if('object' == typeof this.iconsStorage.sprite && this.iconsStorage.sprite.data) {
                        iconsData.sprites = this.iconsStorage.sprite.data.icons;
                    }
                    source.icons = iconsData;
                } else {
                    if(typeof options.data == "string") {                       
                        if(!/=/.test(options.data) && path.extname(options.data) != "" && [".json", ".yaml"].includes(path.extname(options.data).toLowerCase())) {
                            let dataPath = path.join(cwd, options.data);
                            if(!fs.existsSync(dataPath)) {
                                this.log(`Data file by path ${dataPath} not exists. Error while assembling ${pageModel.get('path')} page.`, 'error');
                            } else {
                                let model = this.collection.findWhere({path: path.relative(this.root, dataPath)}, false);
                                if(model) {
                                    source = _.extend(source, model.get('body'));
                                    let page_ids = [];
                                    if(model.has('page_ids')) {
                                        page_ids = model.get('page_ids');
                                    }
                                    page_ids.push(rootData.ungic.page.id);
                                    model.set('page_ids', page_ids, {silent: true});
                                } else {
                                    this.log(`Unknown data file ${dataPath}. Error while assembling ${rootData.ungic.page.path} page.`, 'error');
                                }
                            }
                        } else if(path.extname(options.data) == "" || /=/.test(options.data)) {
                            let inlineData = options.data.replace(/\&amp;/g, '&');
                            try {
                                inlineData = queryString.parse(inlineData);
                                source = _.extend(source, inlineData);
                            } catch(e) {
                                this.log(`Error processing queryString: ${e.message}`);
                            }
                        } else if(path.extname(options.data) != "") {
                            this.log(`Unknown data file ${options.data}. Error while assembling ${rootData.ungic.page.path} page.`, 'error');
                        }            
                    } else if (typeof options.data == 'object') {
                        source = _.extend(source, options.data);
                    }
                }
            }
            let templatePath = path.join(cwd, template);
            let content = '';
            if(!fs.existsSync(templatePath)) {
                this.log(`File by path ${templatePath} not exists. Error while assembling ${rootData.ungic.page.path} page`, 'error');
            } else {
                let model = this.collection.findWhere({path: path.relative(this.root, templatePath)}, false);
                if(model) {
                    let supportedTypes = systemConfig.supportedTypes;
                    let supportedIncludeTypes = systemConfig.supportedIncludeTypes;
                    supportedIncludeTypes = supportedIncludeTypes.map(type => supportedTypes[type]);
                    if(supportedIncludeTypes.indexOf(model.get('type')) == -1) {
                        return this.log(`${model.get('type')} type not supported for including. Error while assembling ${rootData.ungic.page.path} page`, 'error');
                    }
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
                    if(options.sass != undefined) {
                        sass = {};
                        let scssPlugin = this.project.plugins.get('scss');                        
                        let exportSearch = function(str) {
                            let spl = str.split('.');
                            let data = [];
                            let search = function(id, data=[]) {
                                let res = scssPlugin.exports.chain().filter(model => model.id.indexOf(id) == 0).map(m => m.toJSON()).value();                               
                                if(res.length) {
                                    if(!spl.length) {
                                        return res;
                                    }
                                    return search(id + '__' + spl.shift(), res);
                                } else {                                    
                                    if(!spl.length) {
                                        return data;
                                    } else {                                        
                                        return search(id + '__' + spl.shift(), res);
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
                                        this.sassUsed.set({
                                            oid: r.id,
                                            page_id: rootData.ungic.page.id
                                        });
                                    }
                                }
                            }
                        }
                        if(Object.keys(sass).length == 1 && options.single) {
                            sass = sass[Object.keys(sass)[0]];
                        }
                        source.sass = sass;
                    }

                    let handlebarsPreprocess = () => {
                        if('object' == typeof options.move) {
                            source = _.extend({}, source, options.move);
                        }
                        content = handlebarsCompile(content, source); 
                    }
                    if(model.get('type') == 'template') {
                        handlebarsPreprocess();
                    }
                    if(this.customTypeStorage.storage.length) {   
                        if(_.find(this.customTypeStorage.storage, el => el.includeHandler == true && model.get('type') == el.type)) {
                            handlebarsPreprocess();
                        } else {
                            let handler = _.find(this.customTypeStorage.storage, el => typeof el.includeHandler == "string" && model.get('type') == el.type);
                            if(handler) {
                                //source = _.extend(source, inlineData);
                                if('object' == typeof options.move) {
                                    source = _.extend({}, source, options.move);
                                }   
                                try {      
                                    if(handler.dev) {  
                                        delete require.cache[path.normalize(handler.includeHandler)]; 
                                    }

                                    let includeHandler = require(handler.includeHandler);                                                     
                                    content = includeHandler(content, Object.assign({}, source), Handlebars.compile); 

                                    if(typeof content != "string") {
                                        throw new Error(`includeHandler for custom ${model.get('type')} file type should return the processed content as a string!`);
                                    }
                                } catch(e) {        
                                    this.error(`Content processing error in includeHandler for custom ${model.get('type')} file type: ${e.message}.`);
                                }
                            }
                        }
                    }                   
                    if(model.get('type') == 'part') {
                        let s = {
                            ungic: source.ungic
                        }
                        if(sass) {
                            s.sass = source.sass;
                        }
                        content = handlebarsCompile(content, s);
                        //content = Handlebars.compile(content)(s);
                    }
                    if(model.get('type') == 'page') {
                        this.log(`${model.get('path')} page cannot be included in the ${rootData.ungic.page.path} page! Any page cannot be included in another page!`, 'error');
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
        let availableTypes = _.keys(systemConfig.supportedTypes);
        if(availableTypes.indexOf(handlerID) == -1) {
            return
        }
        attrs.type = systemConfig.supportedTypes[handlerID];
        if(this.typeHandlers.has(handlerID)) {
            try {          
                let customType = _.find(this.customTypeStorage.storage, el => el.type == attrs.type), content;               
                if(customType) {
                    content = await this.typeHandlers.get(handlerID).call(this, attrs.body, _.omit(Object.assign({}, attrs), 'body'));
                    if(typeof content != "string") {                   
                        this.error(`transformer for ${handlerID} file type should return exclusively processed content as a string`);
                    } else {
                        attrs.body = content;
                    }
                } else {
                    attrs = await this.typeHandlers.get(handlerID).call(this, attrs);
                }         
            } catch(e) {
                console.log(e);
            }
        }      
        if(!attrs) {
            return;
        }
        return attrs;
    }
    async getReleaseInfo(pageData) {
        let pipes = _.findWhere(this.pipes.storage, {page_id: pageData.id});
        let result = {};
        if(pipes && pipes.css && pipes.css.length) {
            result.pipes = pipes.css;
        }
        let icons = _.filter(this.iconsUsed.storage, icon => icon.page_id == pageData.id);
        if(icons && icons.length) {
            result.icons = icons;
        }
        return result;
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
        let model = this.collection.find(model=>model.get('path') == path.normalize(ph));
        if(model) {
            this.pipes.clean(m => m.page_id == model.id);
            this.mainScssPipes.clean(m => m.page_id == model.id);
        }
        await this.collection.add(entityData, options);
    }
    toRelease(args) {
        return new Promise(async(done, rej) => {
            try {
                this.release = args;
                let watched = this.unwatched;
                this.unwatch();
                let model = this.collection.findByID(args.page.id);
                let prevPath = model.get('path');
                this.collection.remove(model, {silent: true});
                await this.setEntityByPath('add', model.get('path'), {silent: true});

                model = this.collection.find(model => model.get('path') == prevPath);
                let self = this;
                async function ready(events) {
                    if(!watched) {
                        self.watch();
                    }
                    delete self.release;
                    // Восстанавливаем
                    self.collection.remove(model, {silent: true});
                    await self.setEntityByPath('add', model.get('path'), {silent: true});
                    self.off('ready', ready);
                    done();
                }

                this.on('ready', ready);
                this.renderMaster.add({
                    description: `${model.get('path')} page assembly`,
                    models: [model]
                });
            } catch(e) {
                console.log(e);
            }
        });
    }
    toUpdate(ph) {
        return this.setEntityByPath('add', ph, {merge: true});
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
            this.system(e);
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
            this.system(e);
        }
    }
    async distPretty(ph) {
        let pathDist = path.join(this.dist, ph);
        if(!await fsp.exists(pathDist)) {
            throw new Error(`File by path ${pathDist} not exist`);
        } else {
            let config = this.config;
            let beautifyConfig;

            if(typeof this.project.app.PLUGINS_SETTINGS.beautify == 'object') {
                beautifyConfig = this.project.app.PLUGINS_SETTINGS.beautify;
            }
            if(typeof config.beautify == 'object' && Object.keys(config.beautify).length) {
                beautifyConfig = config.beautify;
            }
            
            beautifyConfig = _.extend({unformatted: ["script", "style"]}, beautifyConfig);
            let content = beautify.html(await fsp.readFile(pathDist, 'UTF-8'), _.extend({"indent_size": 4}, beautifyConfig));
            return fse.outputFile(pathDist, content);
        }
    }
    async distCompress(ph) {
        let config = this.config;
        let pathDist = path.join(this.dist, ph);
        if(!await fsp.exists(pathDist)) {
            throw new Error(`File by path ${pathDist} not exist`);
        } else {
            let content = await fsp.readFile(pathDist, 'UTF-8');
            content = minify(content, {
              "caseSensitive": false,
              "collapseBooleanAttributes": false,
              "collapseInlineTagWhitespace": true,
              "collapseWhitespace": true,
              "conservativeCollapse": true,
              "continueOnParseError": false,
              "decodeEntities": false,
              "includeAutoGeneratedTags": false,
              "keepClosingSlash": false,
              "maxLineLength": 0,
              "minifyCSS": true,
              "minifyJS": true,
              "preserveLineBreaks": true,
              "preventAttributesEscaping": false,
              "processConditionalComments": false,
              "removeAttributeQuotes": false,
              "removeComments": true,
              "removeEmptyAttributes": false,
              "removeEmptyElements": false,
              "removeOptionalTags": false,
              "removeRedundantAttributes": false,
              "removeScriptTypeAttributes": true,
              "removeStyleLinkTypeAttributes": true,
              "removeTagWhitespace": false,
              "sortAttributes": false,
              "sortClassName": false,
              "trimCustomFragments": true,
              "useShortDoctype": true
            });
            return fse.outputFile(pathDist, content);
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
        let template = path.join(__dirname, 'templates/page.hbs');
        template = await fsp.readFile(template, 'UTF-8');
        if(path.extname(name) != '') {
            name = path.basename(name, path.extname(name));
        }
        let rootPath = path.join(this.root, name + '.html');
        if(await fsp.exists(rootPath)) {
           throw new Error(`${name} page already exist!`);
        }
        if(args.components) {
            args.components = args.components.join(',');
        }
        return fse.outputFile(rootPath, Handlebars.compile(template)(args));
    }
    async _render(events) {
        //console.log(events);
        this.emit('render');
        let config = this.config;
        let builder = this.builder.config;

        let build = builder.dev;
        if(this.release) {
           build = this.release;
        }
        let prjConfig = this.project.config;
        let source = {
            fs: config.fs,
            project: {
                name: prjConfig.name,
                version: prjConfig.version,
                author: prjConfig.author,
                address: this.project.fastify.address
            }
        }
        for(let event of events) {
            for(let model of event.models) {
                let scssPlugin = this.project.plugins.get('scss');
                let attrs = model.get();
                source = _.extend(source, {
                    model: model,
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
                } catch(e) {
                    this.log(`Handlebars compile error in ${attrs.path} page: ${e.message}`, 'error');
                }
                let distPath = this.dist;
                if(this.release) {
                    distPath = path.join(this.dist, 'releases', this.release.releaseName + '-v' + this.release.version);
                    if(build.validation) {
                        if(attrs.amp) {
                            let resultValidation = await this.ampValidate(output, attrs.path);
                            await fse.outputFile(path.join(distPath, path.basename(attrs.path, path.extname(attrs.path)) + '.amp.validation.result.txt'), resultValidation);
                        } else {
                            let resultValidation = await this.validate(output, attrs.path);
                            await fse.outputFile(path.join(distPath, path.basename(attrs.path, path.extname(attrs.path)) + '.w3.validation.result.txt'), resultValidation);
                        }
                    }
                    let templatesModels = this.collection.filter(m => m.has('page_ids') && m.get('page_ids').indexOf(model.id) != -1 && /*(*/m.get('type') == 'template' /*|| m.get('type') == 'pug_template'  || m.get('type') == 'mustache_template' || m.get('type') == 'underscore_template')*/);
                    if(templatesModels.length) {
                        for(let template of templatesModels) {
                            let output = template.get('body');
                            let folderName = template.get('type') + 's';
                            let templatePath = path.join(distPath, 'exports', folderName, template.get('path'));
                            await fse.outputFile(templatePath, output);
                        }
                    }
                } else {
                    if(build.validation) {
                        if(attrs.amp) {
                            await this.ampValidate(output, attrs.path);
                        } else {
                            await this.validate(output, attrs.path);
                        }
                    }
                }
                let configCheerio = typeof config.cheerio == 'object' ? config.cheerio : {};
                configCheerio = _.extend({decodeEntities: false}, this.project.app.PLUGINS_SETTINGS.cheerio, configCheerio);

                let $;
                try {
                    $ = cheerio.load(output, configCheerio);
                } catch(e) {
                    this.log(`HTML Syntax processing error in ${attrs.path} page`);
                }
                if($) {
                    let $body = $('body'), $head =  $('head');
                    scssPlugin.cleanHtmlInternalSass(model.id);
                    let sassInternalRulesChanged = [], sassInternalRules = [];
                    let hasSlots = [];
                    let scssProms = [];
                    let self = this;

                    //let pipes = _.findWhere(this.pipes.storage, {page_id: args.id});

                    $('[class*="@"]').each(function() {
                        let pipes = _.findWhere(self.mainScssPipes.storage, {page_id: model.id});
                        let cid = $(this).parents('[cid]').attr('cid');                        
                        cid = cid ? cid : (pipes && pipes.main ? pipes.main : "");
                        let currentComponent; 
                        if($(this).attr('cid')) {
                            cid = $(this).attr('cid');
                            currentComponent = true;
                        }              
                        let parentClasses = ($(this).parent().attr('class') || "").split(' ').map(e => e.trim()).filter(e => e.trim() != "");                        
                        let classes = $(this).attr('class').split(' ').map(e => e.trim()).filter(e => e.trim() != "");
                          
                        classes = classes.map(e => {                            
                            if(/@(?!\\)(@|\d+)?/.test(e)) {        
                                //console.log(e);                      
                                e = e.replace(/@(?!\\)(@|\d+)?/gm, function(match, num) {                                    
                                    if(!num) {
                                        num = 0;
                                    }
                                    if(num == "@" || currentComponent) {
                                        return cid;
                                    } else {
                                        num = parseInt(num);  
                                        if(num > 0) {
                                            num = num - 1;
                                        }                                                                
                                        return parentClasses[num] ? parentClasses[num] : cid;
                                    }
                                });
                            } else {                                                             
                                e = e.replace(/\@\\*/gm, cid);
                            }
                            return e;
                        });                   
                        $(this).attr('class', classes.join(' '));
                    });

                    $('[cid]').each(function() {
                        $(this).removeAttr('cid');
                    });


                    $('style[scss], style[sass]').each(function() {
                        let attr = $(this).attr('sass') ? 'sass' : 'scss';
                        let cid = $(this).attr(attr);
                        scssProms.push(new Promise(async(res) => {
                            try {
                                if('string' == typeof cid && cid.trim() != '') {
                                    let cids = await scssPlugin.getComponents();
                                    if(cids.indexOf(cid) != -1) {
                                        let slot = $(this).attr('slot') || false;
                                        if(!slot || (slot && slot.trim() == '')) {
                                            self.log(`To transfer sass internal styles to sass component you need specify "slot" attribute, example: slot="part1"`, 'warning');
                                            return res();
                                        }
                                        if(slot) {
                                            hasSlots.push(slot);
                                        }
                                        let content = $(this).html();
                                        let prev = _.find(self.slotsStorage.storage, r => r.cid == cid && r.slot == slot && r.rules == content);
                                    
                                        if(!prev) {   
                                            // Удалить старое значение этого слота  
                                            self.slotsStorage.clean(r => r.cid == cid && r.slot == slot && r.htmlModelId == model.id);    
                                            prev = {
                                                htmlModelId: model.id,
                                                cid,
                                                slot,
                                                rules: content
                                            }                                                         
                                            self.slotsStorage.set(prev);
                                            sassInternalRulesChanged.push(prev);
                                        }                     
                                        
                                        sassInternalRules.push(prev);
                                        $(this).remove();
                                        return res();
                                    } else {
                                        self.log(`${cid} sass components not exist, styles will be generated as internal styles`, 'warning');
                                    }
                                }
                                try {
                                    var result = sass.renderSync({data: $(this).html()});
                                    $(this).html(result.css.toString());
                                    $(this).removeAttr(attr).removeAttr('slot');
                                } catch(e) {
                                    self.log('Compilation error of internal sass styles', 'error');
                                    self.log(e);
                                }
                            } catch(e) {
                                console.log(e);
                            }
                            res();
                        }));
                    });

                    // Проверить не изменилось ли кол-во слотов, и имеются ли вообще слоты
                    if(scssProms.length) {
                        await Promise.all(scssProms);

                        let prevCount = _.size(_.filter(self.slotsStorage.storage, r => r.htmlModelId == model.id));
                        let activeCount = sassInternalRules.length;
                        if(hasSlots.length) {
                            self.slotsStorage.clean(r => !hasSlots.includes(r.slot) && r.htmlModelId == model.id);    
                        }          
                        //console.log(prevCount, activeCount);
                        if(sassInternalRulesChanged.length || prevCount != activeCount) {                      
                            await scssPlugin.setHtmlInternalSass(sassInternalRules);                        
                            /*if('string' == typeof mixCssLink && !this.release) {
                                $head.append(`<link rel="stylesheet" href="${this.project.fastify.address}/${mixCssLink}">`);
                            }*/
                        }
                    }

                    try {
                        if(!this.release) {
                            let script = `<script src="${this.project.fastify.address + '/ungic/js/dist/pipe.min.js'}" data-connect="${this.project.fastify.address}" data-src="${path.relative(this.dist, path.join(this.dist, attrs.path)).replace(/\\+/g, '/')}"></script>`;
                            $body.append(script);
                            $head.append(`<link rel="stylesheet" href="${this.project.fastify.address + '/ungic/css/devtools.css'}">`);

                            if(this.iconsStorage.fonts && this.iconsStorage.fonts.data && this.iconsStorage.fonts.data.icons.length) {
                                $head.append(`<link rel="stylesheet" href="${this.project.fastify.address + '/ungic/font-icons'}">`);
                            }
                            if(this.iconsStorage.sprite && this.iconsStorage.sprite.data && this.iconsStorage.sprite.data.icons.length) {
                                $head.append(`<link rel="stylesheet" href="${this.project.fastify.address + '/ungic/sprites'}">`);
                            }
                            if(this.iconsStorage.svgSprite  && this.iconsStorage.svgSprite.data && this.iconsStorage.svgSprite.data.icons.length && !this.iconsStorage.svgSprite.data.external) {
                                $body.append(this.iconsStorage.svgSprite.data.sprite);
                            }

                        } else {
                            let styles = [];
                            let distPath = path.join(this.dist, 'releases', this.release.releaseName + '-v' + this.release.version);
                            let self = this;


                            let cleancssConfig = typeof config.cleancss == 'object' ? config.cleancss : {};
                                cleancssConfig = _.extend({level: 2}, this.project.app.PLUGINS_SETTINGS.cleancss, cleancssConfig);

                            let postcssPlugins = [];

                            if(this.release.iconsReleases && this.release.iconsReleases.length) {
                                let svgSprite = _.find(this.release.iconsReleases, {type: 'svgSprite'});
                                if(svgSprite) {
                                    $body.append(svgSprite.sprite);
                                }
                            }
                            postcssPlugins.push(srcReplacer({
                                release: this.release,
                                dist: path.join(this.dist, config.fs.dist.css),
                                distPath
                            }));

                            if(this.release.optimizeInternalStyles) {
                                postcssPlugins.push(clean(cleancssConfig));
                            }

                            if(!this.release.includeExternalStyles) {
                                /*
                                *   Подключили все стили из сасс фремворка и иконки
                                */
                                if(this.release.scssURLS) {
                                    for(let url of this.release.scssURLS) {
                                        $head.append(`<link rel="stylesheet" href="${url.replace(/\\+/g, '/')}">`);
                                    }
                                }
                                if(this.release.iconsReleases && this.release.iconsReleases.length) {
                                    for(let el of this.release.iconsReleases) {
                                        if(el.css_url) {
                                            $head.append(`<link rel="stylesheet" href="${el.css_url}">`); // .replace(/\\+/g, '/')
                                        }
                                    }
                                }
                            } else {
                                /*
                                *   Перекидывем все стили в инлайн стили
                                */
                                if(this.release.scssURLS) {
                                    for(let url of this.release.scssURLS) {
                                        let cssRules = await fsp.readFile(path.join(distPath, url), 'UTF-8');
                                        styles.unshift({
                                            path: path.join(distPath, url),
                                            url,
                                            cssRules
                                        });
                                    }
                                }
                                if(this.release.iconsReleases && this.release.iconsReleases.length) {
                                    for(let el of this.release.iconsReleases) {
                                        if(el.css_url) {
                                            let cssRules = await fsp.readFile(path.join(distPath, el.css_url), 'UTF-8');
                                            styles.unshift({
                                                path: path.join(distPath, el.css_url),
                                                url: el.css_url,
                                                cssRules
                                            });
                                        }
                                    }
                                }
                            }

                            let linkProms = [];
                            $('link[rel="stylesheet"]').each(function() {
                                linkProms.push(new Promise(async(res, rej) => {
                                    try {
                                    let href = $(this).attr('href');
                                    if(isRelative(href)) {
                                            let ph = path.join(self.dist, href);
                                            if(await fsp.exists(ph)) {
                                                if(!self.release.includeExternalStyles) {
                                                    await fse.copy(ph, path.join(distPath, href));
                                                } else {
                                                    let cssRules = await fsp.readFile(ph, 'UTF-8');
                                                    styles.unshift({
                                                        path: ph,
                                                        url: href,
                                                        cssRules
                                                    });
                                                    $(this).remove();
                                                }
                                            }
                                    }
                                    if(!self.release.includeExternalStyles && isRelative(href) && !isRelative(self.release.host)) {
                                            $(this).attr('href', url.resolve(self.release.host, href));
                                    }
                                    } catch(e) {
                                        console.log(e);
                                    }
                                    res();
                                }));
                            });


                            if(linkProms.length) {
                                await Promise.all(linkProms);
                            }

                            let proms = [];
                            $('style').each(function() {
                                if(self.release.mergeInternalStyles) {
                                    styles.unshift({
                                        cssRules: $(this).html(),
                                        url: null,
                                        path: null
                                    });
                                    $(this).remove();
                                } else {
                                    /*
                                    *   Добавить постксс плагин для замены срс в случае подмены хоста
                                    */
                                    proms.push(new Promise(async(res, rej)=>{
                                        try {
                                            let result = await postcss(postcssPlugins).process($(this).html(), {from: undefined});
                                            if(result.css) {
                                                let rules = result.css;
                                                if(typeof rules != 'string') {
                                                    rules = rules.toString();
                                                }
                                                $(this).html(rules);
                                            }
                                        } catch(e) {
                                            self.log('An error occurred while optimizing styles!', 'error');
                                        }
                                        res();
                                    }));
                                }
                            });

                            if(proms.length) {
                                await Promise.all(proms);
                            }

                            let cssResult = '';
                            if(styles.length) {
                                try {
                                    let result = await postcss(postcssPlugins).process(_.pluck(styles, 'cssRules').join(' '), {from: undefined});
                                    cssResult = result.css;
                                } catch(e) {
                                    console.log(e);
                                }
                            }

                            if(typeof cssResult != 'string') {
                                cssResult = cssResult.toString();
                            }

                            if(typeof cssResult == 'string' && cssResult.trim() != '') {
                                $head.append('<style>' + cssResult +'</style>');
                            }

                            let scripts = [];
                            let promsScripts = [];
                            $('script').each(function() {

                                if($(this).attr('async') || $(this).attr('type') && $(this).attr('type').trim().toLowerCase() != 'text/javascript') {
                                    return
                                }

                                promsScripts.push(new Promise(async(res, rej) => {
                                    try {
                                        if($(this).attr('src')) {
                                            if(self.release.includeLocalScripts) {
                                                let src = $(this).attr('src');
                                                try {
                                                    if(isRelative(src)) {
                                                        let pathToSource = path.join(self.dist, src);
                                                        if(await fsp.exists(pathToSource)) {
                                                            let content = await fsp.readFile(pathToSource, 'UTF-8');
                                                            scripts.unshift(content);
                                                            $(this).remove();
                                                        }
                                                    }
                                                } catch(e) {
                                                    console.log(e);
                                                }
                                            }
                                            res();
                                        } else {
                                            if(self.release.mergeInternalScripts) {
                                                scripts.unshift($(this).html());
                                                $(this).remove();
                                            } else {
                                                if(self.release.optimizeInternalScripts) {
                                                    try {
                                                        let result = await jsOptimaze($(this).html());
                                                        $(this).text(result);
                                                    } catch(e) {
                                                        self.log('An error occurred while optimizing the script', 'error');
                                                        self.log(e);
                                                    }
                                                }
                                            }
                                            res();
                                        }
                                    } catch(e) {
                                        console.log(e);
                                    }
                                }));
                            });

                            if(promsScripts.length) {
                                await Promise.all(promsScripts);
                            }

                            if(scripts.length) {
                                if(this.release.optimizeInternalScripts) {
                                    try {
                                        let res = await jsOptimaze(scripts);
                                        if(res.length) {
                                            if(self.release.internalScriptsInFooter) {
                                                $body.append('<script>'+res+'</script>');
                                            } else {
                                                $head.append('<script>'+res+'</script>');
                                            }
                                        }
                                    } catch(e) {
                                        this.log('An error occurred while optimizing the script', 'error');
                                        this.log(e);
                                    }
                                }
                            }

                            let promsScriptsToFooter = [];
                            if(this.release.externalScriptsInFooter) {
                                $('script').each(function() {
                                    promsScriptsToFooter.push(new Promise(async(res, rej) => {
                                        try {
                                            if($(this).attr('src') && !isRelative($(this).attr('src'))) {
                                                $(this).appendTo('body');
                                            }
                                        } catch(e) {
                                            self.log(e);
                                        }
                                        res();
                                    }));
                                });
                            }

                            if(promsScriptsToFooter) {
                                await Promise.all(promsScriptsToFooter);
                            }

                            let promsSrcReplacer = [];
                            $('[src], [href]').each(function() {
                                let attr = $(this).attr('href') ? 'href' : 'src';
                                let urlEl = $(this).attr(attr);
                                if(isRelative(urlEl) && !/^\#/.test(urlEl)) {
                                    let pathToDist = path.join(self.dist, urlEl), pathToRelease = path.join(distPath, urlEl);
                                    promsSrcReplacer.push(new Promise(async(res, rej) => {
                                        try {
                                            if(await fsp.exists(pathToDist) && !await fsp.exists(pathToRelease)) {
                                                await fse.copy(pathToDist, pathToRelease);
                                            }
                                        } catch(e) {
                                            console.log(e);
                                        }
                                        if(self.release.host && !isRelative(self.release.host)) {
                                            $(this).attr(attr, url.resolve(self.release.host, urlEl));
                                        }

                                        res();
                                    }))
                                }
                            });
                            await Promise.all(promsSrcReplacer);

                        }
                    } catch(e) {
                        console.log(e);
                    }

                    output = $.html();
                    if(config.replaceAmpToSymbol) {
                        output = output.replace(/\&amp\;/gm, '&');
                    }

                    if(build.formatting === 'beautify') {
                        let configBeautify = typeof config.beautify == 'object' ? config.beautify : {};
                            configBeautify = _.extend({unformatted: ["script", "style"]}, this.project.app.PLUGINS_SETTINGS.beautify, configBeautify);
                        
                        
                        output = beautify.html(output, _.extend({"indent_size": 4}, configBeautify));
                    }
                    if(build.formatting === 'minifier') {
                        let params = typeof config.minifier == 'object' ? config.minifier : {};
                            params = _.extend(this.project.app.PLUGINS_SETTINGS.htmlminifier, params);
                            try {
                                output = minify(output, _.extend({
                                "caseSensitive": false,
                                "collapseBooleanAttributes": false,
                                "collapseInlineTagWhitespace": true,
                                "collapseWhitespace": true,
                                "conservativeCollapse": true,
                                "continueOnParseError": false,
                                "decodeEntities": false,
                                "includeAutoGeneratedTags": false,
                                "keepClosingSlash": false,
                                "maxLineLength": 0,
                                "minifyCSS": !(this.release && this.release.optimizeInternalStyles),
                                "minifyJS": true,
                                "preserveLineBreaks": true,
                                "preventAttributesEscaping": false,
                                "processConditionalComments": true,
                                "removeAttributeQuotes": false,
                                "removeComments": true,
                                "removeEmptyAttributes": false,
                                "removeEmptyElements": false,
                                "removeOptionalTags": false,
                                "removeRedundantAttributes": false,
                                "removeScriptTypeAttributes": true,
                                "removeStyleLinkTypeAttributes": true,
                                "removeTagWhitespace": false,
                                "sortAttributes": true,
                                "sortClassName": true,
                                "trimCustomFragments": true,
                                "useShortDoctype": true
                                }, params));
                            } catch(e) {
                                this.log(e);
                                this.log(`An error occurred while rendering the ${attrs.path} page. Origin (minify): ${e.message}`, 'error');
                            }
                    }
                    distPath = path.join(distPath, attrs.path);
                    await fse.outputFile(distPath, output);
                    this.log(`${attrs.path} page successfully compiled to ${distPath}`, 'success');
                    //this.emit('one_ready', attrs);
                }
            }
        }
        this.emit('ready', events);
        this.emit('rendered', true);
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
            }
            if(!fs.existsSync(ph)) {
                this.resources.delete(ph);
            }
        }
    }
    async initialize() {
        if(this.project.config.build.plugins[this.id]) {
            try {
                this.builder = new builder(require('./build.model-scheme'), this.project.config.build.plugins[this.id]);
            } catch(e) {
                return this.system('HTML build scheme incorrect. Origin: \n' + e.message, 'error', {exit: true});
            }
        }
    }
    async begin(options) {
        if(options.icons) {
            this.iconsStorage = options.icons;
        }
        let config = this.config;
        let types = _.keys(systemConfig.supportedTypes).join('|');
        let files = await fg('**/*.('+types+')', {dot: false, cwd: this.root, deep: 10});
        for(let file of files) {
            await this.setEntityByPath('add', file, {silent: true});
        }

        let models = this.collection.findAllWhere({type: 'page'}, false);

        let scssPlugin = this.project.plugins.get('scss');
        scssPlugin.on('exports', (event, models) => {
            if(Array.isArray(models)) {
                let storage = this.sassUsed.storage;
                let ids = _.map(models, m => m.model ? m.model.id : m.id);
                let expOptions = _.filter(storage, e => ids.indexOf(e.oid) != -1);
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
            }
        });
        let iconsPlugin = this.project.plugins.get('icons');

        iconsPlugin.on('changeSvgMode', async e => {
            if(e == 'fonts') {
                delete this.iconsStorage.svgSprite
            } else {
                delete this.iconsStorage.fonts
            }
            if(this.iconsUsed.storage.length) {
                let pages = _.groupBy(this.iconsUsed.storage, 'page_id');
                for(let pageId in pages) {
                    let page = this.collection.findByID(pageId);
                    if(page) {
                        this.collection.remove(pageId, {silent: true});
                        await this.setEntityByPath('add', page.get('path'));
                    }
                }
            }
        });

        this.project.on('icons', async e => {
            try {
                let pagesReady = [];
                let ids;
                this.iconsStorage[e.type] = e;
                if(this.iconsDataUsed.storage.length) {
                    for(let data of this.iconsDataUsed.storage) {
                        let page = this.collection.findByID(data.page_id);
                        if(page) {
                            this.collection.remove(page.id, {silent: true});
                            pagesReady.push(page.id);
                            await this.setEntityByPath('add', page.get('path'));
                        }
                    }
                }
                if(this.iconsUsed.storage.length) {
                    let pagesToRebuild = [];
                    let pages = _.groupBy(this.iconsUsed.storage, 'page_id');
                    for(let pageId in pages) {
                        if(e.models && e.models.length) {
                            for(let model of e.models) {
                                let iconID = model.id;
                                for(let icon of pages[pageId]) {
                                    if(icon.icon_id == iconID && !pagesToRebuild.includes(pageId) && !pagesReady.includes(pageId)) {
                                        pagesToRebuild.push(pageId);
                                    }
                                }
                            }
                        }
                    }
                    if(pagesToRebuild.length) {
                        for(let pageId of pagesToRebuild) {
                            let page = this.collection.findByID(pageId);
                            if(page) {
                                this.collection.remove(pageId, {silent: true});
                                await this.setEntityByPath('add', page.get('path'));
                            }
                        }
                    }
                }
            } catch(e) {
                console.log(e);
            }
        });
        if(Array.isArray(models) && !models.length || !models) {
            this.emit('rendered', true);
            this.renderMaster.launched = true;
            return;
        }
        let pages = models.map(model=>model.toJSON());

        this.renderMaster.add({
            description: `assembly pages: ${_.pluck(pages, 'path').join(', ')}`,
            models
        });
        let status = this.renderMaster.status();
        if(status.clean) {
            this.emit('rendered', true);
        }
        await this.renderMaster.run();
    }
}

module.exports = htmlPlugin;

