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
const hbs = require('handlebars');
const sass = require('sass');

class iconsPlugin extends plugin {
    constructor(config={}, sysconfig={}) {
        config.id = 'icons';
        super(require('./model-scheme'), config, sysconfig);
        this.codepoints = [];
        this.watchController = new watchGrouping;
        this.watchController.on('ready', events => {
            this.fileChanged(events);
        });
        this.iconsStorage = {};
        this.svgo = new SVGO({
            plugins: [
                {removeUselessDefs: false},
                {removeViewBox: false},
                {removeDimensions: true},
                {cleanupListOfValues:true},
                {removeTitle:false},
                {removeRasterImage: true},
                {removeUselessStrokeAndFill: true},
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
            unicode: {
                type: 'string'
            },
            title: {
                type: 'string'
            },
            type: {
                type: 'string',
                enum: ['svg', 'font', 'sprite'],
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
        this.fontsDist = path.join(this.dist, config.fs.dist.fonts);
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

        this.on('icons', data => {
            this.iconsStorage[data.type] = data;
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
    async render(events) {
        let config = this.config;
        for(let event of events) {
            if(event.type == 'fonts') {
                await this.fontGeneration(event.models);
            }
            if(event.type == 'svg_sprite') {
                await this.generateSvgSprite(event.models);
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

        let types = [];
        for(let p of paths) {
            let dirName = p.split(path.sep)[0];
            types.push(this.getTypeByDirName(dirName));
        }

        if(types.indexOf('font') != -1) {
            this.allFontsToRender();
        }
        if(types.indexOf('svg') != -1) {
            this.allSVGToRender();
        }
    }
    getTypeByDirName(dirName) {
        let config = this.config, type;
        if(dirName == config.fs.source.sprites) {
            type = 'sprite';
        }
        if(dirName == config.fs.source.svg_fonts) {
            type = 'font'
        }
        if(dirName == config.fs.source.svg_sprites) {
            type = 'svg'
        }
        return type;
    }
    async setEntityByPath(ph, options={}) {
        let supports = ['png', 'svg', 'jpeg', 'jpg'];
        let config = this.config;
        let extname = path.extname(ph).replace('.', '');
        if(supports.indexOf(extname) == -1) {
            return this.error(`.${extname} images are not supported`);
        }

        let fullPath = path.join(this.root, ph);
        let dirName = path.relative(this.root, fullPath).split(path.sep)[0];


        let type = this.getTypeByDirName(dirName);

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
            name: path.basename(ph, path.extname(ph)).replace(/[_-]+/g, ' '),
            id: path.basename(ph, path.extname(ph)).replace(/[^\w]+/g, '-'),
            path: path.normalize(ph)
        }
        if(path.extname(ph) == '.svg') {
            let svgSource = await fsp.readFile(fullPath, 'UTF-8');
            try {
                svgSource = await this.svgo.optimize(svgSource);
                let dom = new JSDOM(svgSource.data);
                let svg = dom.window.document.querySelector('svg');
                svg.setAttribute('id', entityData.id);
                svg.removeAttribute('style');
                let symbols = svg.querySelectorAll('symbol');
                if(symbols.length) {
                    for(let s of symbols) {
                        while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s);
                        s.remove();
                    }
                }
                let groups = svg.querySelectorAll('g');
                if(groups.length) {
                    for(let g of groups) {
                        if(g.innerHTML == '') {
                            g.remove();
                        }
                    }
                }
                let title = svg.querySelector('title');
                if(title) {
                    entityData.title = title.textContent;
                    title.remove();
                }
                entityData.svg = svg.outerHTML;
                entityData.codepoint = this.getCodepoint();
                entityData.unicode = String.fromCharCode(entityData.codepoint)
            } catch(e) {
                this.log(e);
            }
        }
        await this.collection.add(entityData, options);
    }
    getHTMLSvgSprite(id, options={}) {
        let model = id;
        if(typeof id != 'object') {
            model = this.collection.findByID(id);
        }
        let fontConfig = this.fontConfiguration();
        let config = this.config;
        let svgOrigin = new JSDOM(model.get('svg'));
        svgOrigin = svgOrigin.window.document.querySelector('svg');
        let dom = new JSDOM('<svg class="ungic-icon" role="img"></svg>');
        let svg = dom.window.document.querySelector('svg.ungic-icon');
        let title = model.get('title');
        if(options.label) {
            title = options.label;
        }
        let className = config.svg_sprite.className;
        if(!options.presentation && title) {
            let titleTag = dom.window.document.createElement("title");
            titleTag.setAttribute('id', className + '-' + model.id + '-title');
            titleTag.innerHTML = title;
            svg.setAttribute('aria-labelledby', className + '-' + model.id + '-title');
            svg.appendChild(titleTag);
        } else {
            svg.setAttribute('aria-hidden', true);
        }
        let useTag = dom.window.document.createElement("use");

        let url = '#' + className + '-' + model.id;
        if(config.svg_sprite.external) {
            url = 'ungic-sprite.svg' + url;
        }
        useTag.setAttribute('xlink:href', url);
        svg.appendChild(useTag);
        if(config.svg_sprite.external) {
            svg.setAttribute('viewBox', svgOrigin.getAttribute('viewBox'));
        }
        if(config.svg_sprite.width) {
            svg.setAttribute('width', config.svg_sprite.width);
        }
        if(config.svg_sprite.height) {
            svg.setAttribute('height', config.svg_sprite.height);
        }
        svg = svg.outerHTML;
        if(options.href) {
            return `<a href="${options.href}">${svg}</a>`;
        } else {
            return svg;
        }
    }
    getHTMlFontIcon(id, options={}) {
        let model = id;
        if(typeof id != 'object') {
            model = this.collection.findByID(id);
        }
        let fontConfig = this.fontConfiguration();

        let title = model.get('title');
        if(options.label) {
            title = options.label;
        }
        let label = title ? `<span class="${fontConfig.font.class}-icon-label">${title}</span>` : '';
        if(options.presentation) {
           label = '';
        }
        if(options.href) {
            return `<a href="${options.href}"><i aria-hidden="true" class="${fontConfig.font.class} ${fontConfig.font.class}-${model.id}"></i>${label}</a>`;
        } else {
            return `<i aria-hidden="true" class="${fontConfig.font.class} ${fontConfig.font.class}-${model.id}"></i>${label}`;
        }
    }
    getSymbol(id, asHTML) {
        let model = id;
        if(typeof id != 'object') {
            model = this.collection.findByID(id);
        }
        let config = this.config;
        let svgSource = model.get('svg');
        let dom = new JSDOM(svgSource);
        let svg = dom.window.document.querySelector('svg');
        let symbol = dom.window.document.createElement("symbol");
        symbol.setAttribute('xmlns', svg.hasAttribute('xmlns') ? svg.getAttribute('xmlns') : 'http://www.w3.org/2000/svg');
        symbol.setAttribute('viewBox', svg.getAttribute('viewBox'));
        symbol.setAttribute('fill', 'currentcolor');
        symbol.setAttribute('id', config.svg_sprite.className + '-' + svg.getAttribute('id'));
        if(svg.hasAttribute('class')) {
            symbol.setAttribute('class', svg.getAttribute('class'));
        }
        symbol.innerHTML = svg.innerHTML;
        if(asHTML) {
            return symbol;
        }
        return symbol.outerHTML;
    }
    fontConfiguration() {
        let config = this.config;
        return {
            font: {
                name: config.fonts.name,
                class: config.fonts.className,
                supports: [
                    {type: 'woff2', format: 'woff2'},
                    {type: 'woff', format: 'woff'},
                    {type: 'ttf', format: 'truetype'},
                    {type: 'svg#' + config.fonts.className, format: 'svg'}
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
    async getFontsSass(models, fonts_path) {
        let template = path.join(__dirname, 'templates', 'fonts_sass.hbs');
        let config = this.config;
        let source = {
            config: this.fontConfiguration(),
            icons: _.map(models, m => _.omit(m.toJSON(), 'svg')),
            fonts_path: fonts_path ? fonts_path : path.relative(path.join(this.dist, config.fs.dist.css), this.fontsDist).replace(/\\+/g, '/') + '/'
        }
        template = await fsp.readFile(template, 'UTF-8');
        let content = hbs.compile(template)(source);
        return content;
    }
    async getCSS(fonts_path, force) {
        if(!this.iconsStorage.fonts) {
            this.error('Icons plugin did not generate icon fonts');
            return ' ';
        }
        if(!this.iconsStorage.fonts.data.icons.length) {
            this.error('No generated font icons');
            return ' ';
        }
        let sassSource = await this.getFontsSass(this.iconsStorage.fonts.models, fonts_path);
        if(!this.lastCSSGeneratedDate || this.lastCSSGeneratedDate != this.iconsStorage.fonts.date || force) {
            this.lastCSSGeneratedDate = this.iconsStorage.fonts.date;
            let result = sass.renderSync({data:`${sassSource} @include render();`});
            this.lastCSS = result.css.toString();
            return this.lastCSS;
        } else {
            return this.lastCSS;
        }
    }
    async fontGeneration(ids) {
        let models = ids;
        if(ids.length && typeof ids[0] != 'object') {
            models = this.collection.filter(model => ids.indexOf(model.id) != -1);
        }
        if(!models.length) {
            this.warning('No icons');
            return
        }

        let sassSource = await this.getFontsSass(models);
        let fontConfig = this.fontConfiguration();
        this.emit('icons', {
            type: 'fonts',
            models,
            date: new Date,
            data: {
                icons: _.map(models, m => _.omit(m.toJSON(), 'svg')),
                config: fontConfig,
                sass: sassSource
            }
        });
        let config = this.config;
        let svgStreams = [];
        const fontStream = new svgicons({
            fontName: config.fonts.name,
            fixedWidth: config.fonts.fixedWidth,
            fontHeight: config.fonts.fontHeight,
            fontWeight: config.fonts.fontWeight,
            centerHorizontally: config.fonts.centerHorizontally,
            normalize: config.fonts.normalize,
            log: () => {}
        }).on('data', (data) => {
            svgStreams.push(data);
        });

        //let distPath = path.join(this.dist, config.fs.dist.fonts)
        let streamPath = path.join(this.fontsDist, config.fonts.name + '.svg');

        let Proccess = [];
        Proccess.push(new Promise((done, rej) => {
            fontStream.pipe(fs.createWriteStream(streamPath)).on('finish', async() => {
                let svgs = Buffer.concat(svgStreams);
                let ttf = svg2ttf(svgs.toString());
                try {
                    await fse.outputFile(path.join(this.fontsDist, config.fonts.name + '.woff2'), Buffer.from(await ttf2woff2.compress(ttf.buffer)));
                    await fse.outputFile(path.join(this.fontsDist, config.fonts.name + '.woff'), Buffer.from(ttf2woff(ttf.buffer).buffer));
                    await fse.outputFile(path.join(this.fontsDist, config.fonts.name + '.eot'), Buffer.from(ttf2eot(ttf.buffer).buffer));
                    await fse.outputFile(path.join(this.fontsDist, config.fonts.name + '.ttf'), Buffer.from(ttf.buffer));
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
    allFontsToRender() {
        let config = this.config;
        if(config.fonts.enabled && !config.fonts_to_sprite) {
            let models = this.collection.filter(m=>m.get('type') == 'font');
            if(models.length) {
                let icons = models.map(model=>model.toJSON());
                this.renderMaster.add({
                    description: `assembly font icons: ${_.pluck(icons, 'id').join(', ')}`,
                    models,
                    type: 'fonts'
                });
            }
        }
    }
    allSVGToRender() {
        let config = this.config;
        if(config.svg_sprite.enabled || config.fonts_to_sprite) {
            let models = [];
            if(config.fonts_to_sprite && config.svg_sprite.enabled) {
                models = this.collection.filter(m=> ['font', 'svg'].indexOf(m.get('type')) != -1);
            } else if(config.svg_sprite.enabled) {
                models = this.collection.filter(m=>m.get('type') == 'svg');
            } else {
                models = this.collection.filter(m=>m.get('type') == 'font');
            }
            if(models.length) {
                let icons = models.map(model=>model.toJSON());
                this.renderMaster.add({
                    description: `assembly svg icons: ${_.pluck(icons, 'id').join(', ')}`,
                    models,
                    type: 'svg_sprite'
                });
            }
        }
    }
    async initialize() {
        let files = await fg('**/*.{svg,png,jpeg,jpg}', {dot: false, cwd: this.root, deep: 10});
        if(files.length) {
            for(let svg of files) {
                await this.setEntityByPath(svg, {silent: true});
            }
        }
        let config = this.config;
        this.allFontsToRender();
        this.allSVGToRender();
        this.on('watcher:'+ config.fs.dirs.source + ':' +config.fs[config.fs.dirs.source].icons, (event, ph, stat) => {
            let supports = ['.png', '.svg', '.jpeg', '.jpg'];
            if(supports.indexOf(path.extname(ph)) != -1) {
                this.watchController.emit('bind', event, ph);
            }
        });
    }
    getSvgSprite(models) {
        let config = this.config;
        if(!models.length) {
            this.warning('No icons');
            return
        }
        let dom = new JSDOM('<svg class="ungic-svg-sprite" hidden style="display:none"></svg>');
        let svg = dom.window.document.querySelector('svg.ungic-svg-sprite');
        for(let model of models) {
            let symbol = this.getSymbol(model, true);
            svg.appendChild(symbol);
        }
        if(config.svg_sprite.external) {
            fse.outputFileSync(path.join(this.dist, 'ungic-sprite.svg'), svg.outerHTML);
        }
        return svg.outerHTML;
    }
    getIconForRender(id, options={}) {
        let model = this.collection.findByID(id);
        if(!model) {
            this.error(`getIconForRender error. ${id} icon not exists`);
            return
        }
        let type =  model.get('type');
        if(type == 'font') {
            return this.getHTMlFontIcon(model, options);
        }
        if(type == 'svg') {
            return this.getHTMLSvgSprite(model, options);
        }
    }
    generateSvgSprite(models) {
        if(!models.length) {
            this.warning('No icons');
            return
        }
        let config = this.config;
        try {
            let sprite = this.getSvgSprite(models);
            this.emit('icons', {
                type: 'svg_sprite',
                models,
                date: new Date,
                data: {
                    icons: _.map(models, m => _.omit(m.toJSON(), 'svg')),
                    sprite,
                    external: config.svg_sprite.external,
                }
            });
            this.log('Svg sprite successfully generated!');
        } catch(e) {
            console.log(e);
        }
    }
    async begin() {
        await this.renderMaster.run();
        this.emit('begined', this.iconsStorage);
    }
}

module.exports = iconsPlugin;