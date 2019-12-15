const plugin = require('../');
const fg = require('fast-glob');
const fs = require('fs');
const fsp = fs.promises;
const fse = require('fs-extra');
const _ = require('underscore');
const { promisify } = require("util");
fsp.exists = promisify(fs.exists);
const path = require('path');
const skeleton = require('../../modules/skeleton');
const renderMaster = require('../../modules/render-master');
const {extend: Collection} = require('../../modules/collectionSync');
const {extend: Model} = require('../../modules/model');
const SVGO = require('svgo');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const svgicons = require('svgicons2svgfont');
const svg2ttf = require('svg2ttf');
const ttf2eot = require('ttf2eot');
const ttf2woff = require('ttf2woff');
const ttf2woff2 = require('wawoff2');
const xmlConverter = require('xml-js');
const stream = require('stream');
const watchGrouping = require('../../modules/watch-grouping');

class iconsPlugin extends plugin {
    constructor(config={}, sysconfig={}) {
        config.id = 'icons';
        super(require('./model-scheme'), config, sysconfig);
        this.codepoints = [];
        this.svg = path.join(this.root, 'svg');
        this.img = path.join(this.root, 'images');
        this.watchController = new watchGrouping;
        this.watchController.on('ready', events => {
            this.fileChanged(events);
        });
        this.svgo = new SVGO({
            plugins: [
                {removeUselessDefs: false},
                {removeViewBox: false},
                {removeDimensions: true},
                {cleanupListOfValues:true},
                {cleanupListOfValues:true},
                {removeTitle:false},
                {removeRasterImage: true},
                {convertStyleToAttrs: false},
                {removeStyleElement: true},
                {removeScriptElement: true},
                {convertPathData: {noSpaceAfterFlags: false}},
                {mergePaths:false},
                //{removeAttrs: {attrs:'(fill|stroke)'}}
            ]
        });
        let model = Model({
            id: {
                type: 'string',
                required: true
            },
            name: {
                type: 'string',
                required: true
            },
            codepoint: {
                type: 'number'
            },
            title: {
                type: 'string'
            },
            type: {
                type: 'string',
                enum: ['raster', 'vector'],
                required: true
            },
            path: {
                type: 'string',
                required: true,
            },
            svg: {
                type: 'string'
            }
        }, {
            objectMerge: true
        });
        config = this.config;
        let collection = Collection(model);

        this.collection = new collection();
        this.collection.on('all', (event, model) => {
            if(event == 'updated' || event == 'added' || event == 'removed') {
                //this.setEntityByPath(model.get('path'));
                this.renderMaster.add({
                    description: `assembly ${model.id} icon`,
                    models: [model]
                });
            }
        });

        this.renderMaster = new renderMaster(_.extend(config.render, {
            id: this.id
        }), this.render.bind(this));
        this.renderMaster.on('log', (type, message) => {
            if(this.project.config.verbose) {
                this.log(message, type);
            }
        });
    }
/*    async prerender(model) {
        let config = this.config;
        if(config.dev_mode == 'fonts') {
            let models = this.collection.get();
            await this.fontGeneration(models);
        }
    }*/
    async render(models) {
        let config = this.config;
        if(config.dev_mode == 'fonts') {
            let models = this.collection.get();
            if(config.dev_mode == 'fonts') {
                await this.fontGeneration(models);
            }
        }
    }
    async fileChanged(events) {
        let paths = [];
        for(let event in events) {
            for(let ev of events[event]) {
               await this.setEntityByPath(path.relative(this.root, ev.path), {silent:true});
               paths.push(path.normalize(path.relative(this.root, ev.path)));
            }
        }
        let models = this.collection.filter(m => paths.indexOf(m.get('path')) !=- 1);
        let icons = models.map(model=>model.toJSON());
        this.renderMaster.add({
            description: `assembly icons: ${_.pluck(icons, 'id').join(', ')}`,
            models
        });
    }
    async setEntityByPath(ph, options={}) {
        let supports = ['png', 'svg', 'jpeg', 'jpg'];
        let config = this.config;
        let extname = path.extname(ph).replace('.', '');
        if(supports.indexOf(extname) == -1) {
            return this.error(`.${extname} images are not supported`);
        }
        let type = (extname == 'svg') ? 'vector' : 'raster';

        let fullPath = path.join(this.root, ph);
        if(!await fsp.exists(fullPath)) {
            let model = this.collection.find(model=> {
                return model.get('path') == path.normalize(ph);
            });
            if(model) {
                this.collection.remove(model.id, options);
            }
            return;
        }
        let entityData = {
            type,
            name: path.basename(ph, path.extname(ph)).replace('_', ' '),
            id: path.basename(ph, path.extname(ph)).replace(/[^\w]+/, '_'),
            path: path.normalize(ph)
        }
        if(type == 'vector') {
            let svgSource = await fsp.readFile(fullPath, 'UTF-8');
            try {
                svgSource = await this.svgo.optimize(svgSource);
                let dom = new JSDOM(svgSource.data);
                let svg = dom.window.document.querySelector('svg');
                svg.setAttribute('id', entityData.id);
                svg.removeAttribute('style');
                let fillNoneElsStyle = svg.querySelectorAll('[style*="fill:none"]');
                if(fillNoneElsStyle.length) {
                    for(let s of fillNoneElsStyle) {
                        s.remove();
                    }
                }
                let fillNoneEls = svg.querySelectorAll('[fill*="none"]');
                if(fillNoneEls.length) {
                    for(let s of fillNoneEls) {
                        s.remove();
                    }
                }
                let symbols = svg.querySelectorAll('symbol');
                if(symbols.length) {
                    for(let s of symbols) {
                        while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s);
                        s.remove();
                    }
                }
                let title = svg.querySelector('title');
                if(title) {
                    entityData.title = title.textContent;
                    title.remove();
                }
                entityData.svg = svg.outerHTML;
                entityData.codepoint = this.getCodepoint();
            } catch(e) {
                this.log(e);
            }
        } else {
            /*
            *   Сохраняем ссылку и тип
            */
        }
        await this.collection.add(entityData, options);
    }
    getSymbol(id) {
        let model = this.collection.findByID(id);
        let svgSource = model.get('svg');
        let dom = new JSDOM(svgSource);
        let svg = dom.window.document.querySelector('svg');
        let symbol = dom.window.document.createElement("symbol");
        symbol.setAttribute('xmlns', svg.hasAttribute('xmlns') ? svg.getAttribute('xmlns') : 'http://www.w3.org/2000/svg');
        symbol.setAttribute('viewBox', svg.getAttribute('viewBox'));
        symbol.setAttribute('fill', 'currentcolor');
        symbol.setAttribute('id', svg.getAttribute('id'));
        if(svg.hasAttribute('class')) {
            symbol.setAttribute('class', svg.getAttribute('class'));
        }
        symbol.innerHTML = svg.innerHTML;
        return symbol.outerHTML;
    }
    fontConfiguration() {
        let config = this.config;
        return {
            font: {
                name: config.font_name,
                class: config.class_name,
                supports: [
                    {type: 'woff2', format: 'woff2'},
                    {type: 'woff', format: 'woff'},
                    {type: 'ttf', format: 'truetype'},
                    {type: 'svg#' + config.class_name, format: 'svg'}
                ]
            }
        }
    }
    exportIcons(ids) {
        /*
        *   Экспортируем в JSON формате
        */
    }
    importIcons(data) {
        /*
        *   Импортируем в JSON формате
        */
    }
    async fontGeneration(ids) {
        let models = ids;
        if(ids.length && typeof ids[0] != 'object') {
            models = this.collection.filter(model => ids.indexOf(model.id) != -1);
        }
        if(!models.length) {
            return
        }

        let fontConfig = this.fontConfiguration();
        this.emit('icons', {
            mode: 'fonts',
            data: {
                icons: _.map(models, m => _.omit(m.toJSON(), 'svg')),
                config: fontConfig,
            }
        });
        let config = this.config;
        let svgStreams = [];
        const fontStream = new svgicons({
            fontName: config.font_name,
            fixedWidth: 512,
            centerHorizontally: true,
            normalize: true,
            fontHeight: false,
            log: () => {}
        }).on('data', (data) => {
            svgStreams.push(data);
        });

        let distPath = path.join(this.dist, config.fs.dist.fonts)
        let streamPath = path.join(distPath, config.font_name + '.svg');

        let Proccess = [];
        Proccess.push(new Promise((done, rej) => {
            fontStream.pipe(fs.createWriteStream(streamPath)).on('finish', async() => {
                let svgs = Buffer.concat(svgStreams);
                let ttf = svg2ttf(svgs.toString());
                try {
                    await fse.outputFile(path.join(distPath, config.font_name + '.woff2'), Buffer.from(await ttf2woff2.compress(ttf.buffer)));
                    await fse.outputFile(path.join(distPath, config.font_name + '.woff'), Buffer.from(ttf2woff(ttf.buffer).buffer));
                    await fse.outputFile(path.join(distPath, config.font_name + '.eot'), Buffer.from(ttf2eot(ttf.buffer).buffer));
                    await fse.outputFile(path.join(distPath, config.font_name + '.ttf'), Buffer.from(ttf.buffer));
                } catch(e) {
                    this.log(e);
                }
                done(true);
            }).on('error', function(err) {
                this.log(`Font generation error`, err);
                done(false);
            });
        }));

        for(let model of models) {
            let Readable = stream.Readable;

            var iconStream = new Readable({read() {
                this.push(model.get('svg'));
                this.push(null)
             }});
            iconStream.metadata = {
                unicode: [String.fromCharCode(model.get('codepoint'))],
                name: model.id
            }
            fontStream.write(iconStream);
        }
        fontStream.end();
        await Promise.all(Proccess).then(r => {
            if(r) {
                this.log('Icon fonts successfully generated!');
            }
        });
        return;
    }
    spriteGeneration(ids, options={}) {

    }
    getCodepoint() {
        let config = this.config;
        let codepoint = config.start_codepoint;
        if(this.codepoints.length) {
            codepoint = Math.max(...this.codepoints);
            codepoint += 1;
        }
        this.codepoints.push(codepoint);
        return codepoint;
    }
    async initialize() {
        let files = await fg('**/*.{svg,png,jpeg,jpg}', {dot: false, cwd: this.root, deep: 10});
        if(files.length) {
            for(let svg of files) {
                await this.setEntityByPath(svg, {silent: true});
            }
        }
        let models = this.collection.get();
        let icons = models.map(model=>model.toJSON());
        this.renderMaster.add({
            description: `assembly icons: ${_.pluck(icons, 'id').join(', ')}`,
            models
        });
        let config = this.config;
        this.on('watcher:'+ config.fs.dirs.source + ':' +config.fs[config.fs.dirs.source].icons, (event, ph, stat) => {
            let supports = ['.png', '.svg', '.jpeg', '.jpg'];
            if(supports.indexOf(path.extname(ph)) != -1) {
                this.watchController.emit('bind', event, ph);
            }
        });
    }
    async begin() {
        await this.renderMaster.run();
        let icons = this.collection.toJSON();
        let config = this.config;
        if(config.mode == 'fonts') {
            icons = _.map(models, m => _.omit(m.toJSON(), 'svg'));
        }
        this.emit('begined', {
            mode: config.dev_mode,
            data: {
                icons,
                config: this.fontConfiguration(),
            }
        });
    }
}

module.exports = iconsPlugin;