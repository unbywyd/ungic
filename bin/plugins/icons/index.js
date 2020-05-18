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
const stream = require('stream');
const watchGrouping = require('../../modules/watch-grouping');
const hbs = require('handlebars');
const sass = require('sass');
const Spritesmith = require('spritesmith');
const resizeImg = require('resize-img');
var sizeOf = require('image-size');
hbs.registerHelper("coordinate", function(val) {
    return !val ? val : val * -1 + 'px';
});
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
        this.spritesDist = path.join(this.dist, config.fs.dist.img, 'sprites');
        let collection = Collection(model);

        this.collection = new collection();
        this.collection.on('all', (event, model) => {
            if(event == 'updated' || event == 'added' || event == 'removed') {
                if(model.has('svg')) {
                    if(config.icons_mode == 'fonts') {
                        this.allFontsToRender();
                    } else {
                        this.allSVGToRender();
                    }
                } else if(config.sprites.enabled) {
                    this.allSpritesToRender();
                }
            } else if(event == 'add') {
                let hasSvg = _.find(model, m => m.model.has('svg'));
                if(hasSvg) {
                    if(config.icons_mode == 'fonts') {
                        this.allFontsToRender();
                    } else {
                        this.allSVGToRender();
                    }
                } else if(config.sprites.enabled) {
                    this.allSpritesToRender();
                }
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
        //console.log(events);
        for(let event of events) {
            if(event.type == 'fonts') {
                await this.fontGeneration(_.sortBy(event.models, model => model.get('id')));
            }
            if(event.type == 'svg_sprite') {
                this.generateSvgSprite(_.sortBy(event.models, model => model.get('id')));
            }
            if(event.type == 'sprite') {
                try {
                    await this.generateSprite(_.sortBy(event.models, model => model.get('id')));
                } catch(e) {
                    console.log(e);
                }
            }
        }
        this.emit('rendered', true);
    }
    async fileChanged(events) {
       // console.log(this.collection.size());
        let paths = [];
        for(let event in events) {
            for(let ev of events[event]) {
               await this.setEntityByPath(path.relative(this.root, ev.path), {silent:true});
               paths.push(path.normalize(path.relative(this.root, ev.path)));
            }
        }
        let config = this.config;
        let svg, sprites;
        for(let p of paths) {
            if(path.extname(p) == '.svg') {
                svg = true;
            } else {
                sprites = true;
            }
            if(svg && sprites){
                break;
            }
        }
        if(sprites) {
            this.allSpritesToRender();
        }

        if(svg) {
            if(config.icons_mode == 'fonts') {
                this.allFontsToRender();
            } else {
                this.allSVGToRender();
            }
        }
        //console.log(this.collection.size());
    }
    async setEntityByPath(ph, options={}) {
        let supports = ['png', 'svg', 'jpeg', 'jpg'];
        let config = this.config;
        let extname = path.extname(ph).replace('.', '');
        if(supports.indexOf(extname) == -1) {
            return this.error(`.${extname} files are not supported. ${path.basename(ph)} will be skipped.`);
        }

        let fullPath = path.join(this.root, ph);
        if(!await fsp.exists(fullPath)) {
            let model = this.collection.find(model=> {
                return model.get('path') == path.normalize(ph);
            });
            if(model) {

                if(model.has('finalPath')) {
                    if(await fsp.exists(model.get('finalPath'))) {
                        fse.remove(model.get('finalPath'));
                    }
                }
                this.collection.remove(model.id, options);
            }
            return;
        }

        let entityData = {
            name: path.basename(ph, path.extname(ph)).replace(/[_-]+/g, ' '),
            id: extname == 'svg' ? ph.replace(path.extname(ph), '').replace(/[^\w]+/g, '_') : ph.replace(/[^\w]+/g, '_'),
            path: path.normalize(ph)
        }

        if(extname == 'svg') {
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
        } else {
            let tempDir = path.join(this.project.root, config.fs.dirs.temp);
            if(!await fsp.exists(tempDir)) {
                await fse.ensureDir(tempDir);
            }
            entityData.finalPath =  fullPath;
            if(config.sprites.maxWidth || config.sprites.maxHeight) {
                var dimensions = sizeOf(fullPath);
                if((config.sprites.maxWidth && dimensions.width > config.sprites.maxWidth) || (config.sprites.maxHeight && dimensions.height > config.sprites.maxHeight)) {
                    let settings = {};
                    if(config.sprites.maxWidth && dimensions.width > config.sprites.maxWidth) {
                        settings.width = config.sprites.maxWidth;
                    }
                    if(config.sprites.maxHeight && dimensions.height > config.sprites.maxHeight) {
                        settings.height = config.sprites.maxHeight;
                    }
                    let image = await resizeImg(fs.readFileSync(fullPath), settings);
                    await fse.outputFile(path.join(tempDir, entityData.path), image);
                    entityData.finalPath = path.join(tempDir, entityData.path);
                }
            }
        }
        /*if(this.collection.has(entityData.id)) {
            let suffix = this.collection.where(model => model.id == entityData.id).length + 1;
            entityData.id = entityData.id + suffix;
            entityData.name = entityData.name + suffix;
        }*/
        await this.collection.add(entityData, options);
    }
    uniqid() {
        return 'un_' + Math.random().toString(36).substr(2, 9);
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
        let title = model.get('name');
        if(options.title) {
            title = options.title;
        }
        let className = config.svg_sprites.className;
        let uniqid = this.uniqid();
        if(!options.presentation && title) {
            let titleTag = dom.window.document.createElement("title");
            titleTag.setAttribute('id', uniqid);
            titleTag.innerHTML = title;
            svg.setAttribute('aria-labelledby', uniqid);
            svg.appendChild(titleTag);
        } else {
            svg.setAttribute('aria-hidden', true);
        }
        let useTag = dom.window.document.createElement("use");

        let url = '#' + className + '-' + model.get('id');
        if(config.svg_sprites.external) {
            url = 'ungic-sprite.svg' + url;
            if(!options.relative_src) {
                url = this.project.fastify.address + '/' + url;
            }
        }
        useTag.setAttribute('xlink:href', url);
        svg.appendChild(useTag);
        if(config.svg_sprites.external) {
            svg.setAttribute('viewBox', svgOrigin.getAttribute('viewBox'));
        }
        if(config.svg_sprites.width) {
            svg.setAttribute('width', config.svg_sprites.width);
        }
        if(config.svg_sprites.height) {
            svg.setAttribute('height', config.svg_sprites.height);
        }
        svg = svg.outerHTML;

        let label = '';
        if(options.label) {
            label = options.label;
        }
        if(options.href) {
            return `<a href="${options.href}">${svg}${label}</a>`;
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

        let title = model.get('name');
        if(options.title) {
            title = options.title;
        }
        title = `<span class="${fontConfig.font.class}-label">${title}</span>`;
        if(options.presentation) {
           title = '';
        }
        let label = '';
        if(options.label) {
            label = options.label;
        }
        if(options.href) {
            return `<a href="${options.href}"><i aria-hidden="true" class="${fontConfig.font.class} ${fontConfig.font.class}-${model.get('id')}"></i>${title}${label}</a>`;
        } else {
            return `<i aria-hidden="true" class="${fontConfig.font.class} ${fontConfig.font.class}-${model.get('id')}"></i>${title}`;
        }
    }
    getHTMlSpriteIcon(id, options={}) {
        let model = id;
        if(typeof id != 'object') {
            model = this.collection.findByID(id);
        }
        let config = this.config;

        let title = model.get('name');
        if(options.title) {
            title = options.title;
        }
        title = `<span class="${config.sprites.className}-label">${title}</span>`;
        if(options.presentation) {
           title = '';
        }
        let label = '';
        if(options.label) {
            label = options.label;
        }
        if(options.href) {
            return `<a href="${options.href}"><i aria-hidden="true" class="${config.sprites.className}-${model.get('id')}"></i>${title}${label}</a>`;
        } else {
            return `<i aria-hidden="true" class="${config.sprites.className}-${model.get('id')}"></i>${title}`;
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
        symbol.setAttribute('id', config.svg_sprites.className + '-' + svg.getAttribute('id'));
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
                size: config.fonts.fontSize,
                supports: [
                    {type: 'woff2', format: 'woff2'},
                    {type: 'woff', format: 'woff'},
                    {type: 'ttf', format: 'truetype'},
                    {type: 'svg#' + config.fonts.className, format: 'svg'}
                ]
            }
        }
    }
    async exportIcons(ids=[], relativePath) {
        let toPath = relativePath ? path.join(this.dist, relativePath) : this.dist;

        if(path.extname(toPath) == '') {
            toPath = path.join(toPath, 'ungic-icons.json');
        }
        let models;
        if(ids.length) {
            models = this.collection.filter(model => ids.indexOf(model.id) != -1);
        } else {
            models = this.collection.get();
        }
        if(!models.length) {
            throw new Error('No icons');
        }
        models = _.filter(models, m => m.has('svg'));
        let result = _.map(models, model => model.toJSON());
        await fse.outputFile(toPath, JSON.stringify(result, null, 4));
        return toPath;
    }
    async release(releaseData, icons) {
        let result = true;
        let {version, name, type} = releaseData;
        let dist = this.dist;
        let fontsDist = this.fontsDist;
        let spritesDist = this.spritesDist;
        let config = this.config;
        this.dist =  path.join(this.dist, 'releases', name + '.' + version);
        this.fontsDist = path.join(this.dist, config.fs.dist.fonts);
        this.spritesDist = path.join(this.dist, config.fs.dist.img, 'sprites');

        this.skipIconsEvent = true;

        try {
            if(type == 'Fonts') {
                // Send icons to fonts
                await this.fontGeneration(icons);
            } else if (type == 'Image sprite') {
                // Send sprite to release
                await this.generateSprite(icons);
            } else {
                // Send to svg sprite
                await this.generateSvgSprite(icons);
            }
        } catch(e) {
            console.log(e);
            result = false;
        }
        this.dist = dist;
        this.fontsDist = fontsDist;
        this.spritesDist = spritesDist;
        delete this.skipIconsEvent;
        return result;
    }
    getIconsList(onlySvg) {
        let models = this.collection.get();
        if(!models.length) {
            throw new Error('No icons');
        }

        models = _.filter(models, m => {
            if(onlySvg && m.has('svg') || !onlySvg && !m.has('svg')) {
                return m;
            }
        });

        return _.map(models, model => model.toJSON());
    }
    async importIcons(relativePath, saveIts) {
        let toPath = relativePath ? path.join(this.dist, relativePath) : this.dist;

        if(path.extname(toPath) == '') {
            toPath = path.join(toPath, 'ungic-icons.json');
        }

        if(!await fsp.exists(toPath)) {
            throw new Error(`${toPath} not exists`);
        }
        let icons = await fsp.readFile(toPath, 'UTF-8');
        icons = JSON.parse(icons);

        let items = [];
        let unwatched = this.unwatched;
        this.unwatch();
        for(let icon of icons) {
            let active = this.collection.findByID(icon.id);
            if(saveIts && icon.path) {
                let toExt = path.join(this.root, icon.path);
                await fse.outputFile(toExt, icon.svg);
            }
            if(active && active.get('svg') != icon.svg || !active) {
                icon.codepoint = this.getCodepoint();
                icon.unicode = String.fromCharCode(icon.codepoint);
                items.push(icon);
            }
        }
        if(!unwatched) {
            this.watch();
        }
        this.collection.add(items, {lastEvent: true});
        return true
    }
    async generateSpriteSass(icons, local) {
        let template = path.join(__dirname, 'templates', 'sprites_sass.hbs');
        let config = this.config;
        let dist =  path.join(this.spritesDist, config.sprites.className + '.png');

        let toPath =  path.relative(path.join(this.dist, config.fs.dist.css), dist).replace(/\\+/g, '/');
        // path.join(spritesPath, dist)
        if(local) {
            toPath = this.project.fastify.address + '/' + path.relative(this.project.dist, dist).replace(/\\+/g, '/');
        }
        let source = {
            config: {
                className: config.sprites.className
            },
            icons,
            path: toPath
        }
        template = await fsp.readFile(template, 'UTF-8');
        //console.log(source);
        let content = hbs.compile(template)(source);
        return content;
    }
    async getFontsSass(models, local) {
        let template = path.join(__dirname, 'templates', 'fonts_sass.hbs');
        let config = this.config;
        let toPath = path.relative(path.join(this.dist, config.fs.dist.css), this.fontsDist).replace(/\\+/g, '/') + '/';
        if(local) {
            toPath = this.project.fastify.address + '/' + path.relative(this.project.dist, this.fontsDist).replace(/\\+/g, '/') + '/'
        }
        let source = {
            config: this.fontConfiguration(),
            icons: _.map(models, m => {
                let data = _.omit(m.toJSON(), 'svg');
                data.unicode = data.codepoint.toString(16);
                return data;
            }),
            fonts_path: toPath
        }
        template = await fsp.readFile(template, 'UTF-8');
        let content = hbs.compile(template)(source);
        return content;
    }
    async getFontsCSS() {
        if(!this.iconsStorage.fonts) {
            this.error('Icons plugin did not generate icon fonts');
            return ' ';
        }
        if(!this.iconsStorage.fonts.data.icons.length) {
            this.error('No generated font icons');
            return ' ';
        }
        let sassSource = await this.getFontsSass(this.iconsStorage.fonts.models, true);
        if(!this.lastFontsCSSGeneratedDate || this.lastFontsCSSGeneratedDate != this.iconsStorage.fonts.date) {
            this.lastFontsCSSGeneratedDate = this.iconsStorage.fonts.date;
            let result = sass.renderSync({data:`${sassSource} @include render();`});
            this.lastFontsCSS = result.css.toString();
            return this.lastFontsCSS;
        } else {
            return this.lastFontsCSS;
        }
    }
    async getSpritesCSS() {
        if(!this.iconsStorage.sprite) {
            this.error('Icons plugin did not generate sprites');
            return ' ';
        }
        if(!this.iconsStorage.sprite.data.icons.length) {
            this.error('No generated sprites');
            return ' ';
        }
        let sassSource = await this.generateSpriteSass(this.iconsStorage.sprite.data.icons, true);
        if(!this.lastSpritesCSSGeneratedDate || this.lastSpritesCSSGeneratedDate != this.iconsStorage.sprite.date) {
            this.lastSpritesCSSGeneratedDate = this.iconsStorage.sprite.date;
            let result = sass.renderSync({data:`${sassSource} @include render();`});
            this.lastSpriteCSS = result.css.toString();
            return this.lastSpriteCSS;
        } else {
            return this.lastSpriteCSS;
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
        let config = this.config;
        let sassSource = await this.getFontsSass(models);
        let fontConfig = this.fontConfiguration();
        if(!this.skipIconsEvent) {
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
        } else {
            let renderConfig = {
                data: sassSource + ' @include render();'
            }
            let css = await new Promise((res, rej) => {
                sass.render(renderConfig, (err, result) => {
                    if(err) {
                        console.log(err);
                        this.error(err.message);
                        return res(false);
                    }
                    res(result.css);
                });
            });
            if(!css) {
                this.error('Icon sass generation error');
            }
            await fse.outputFile(path.join(this.dist, config.fs.dist.css, config.fonts.name  + '.css'), css);
        }

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

        let streamPath = path.join(this.fontsDist, config.fonts.name + '.svg');
        if(!await fsp.exists(streamPath)) {
            await fse.outputFile(streamPath, '');
        }
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
            }).on('error', (err) => {
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
            //console.log(model.get('unicode'));
            fontStream.write(iconStream);
        }
        fontStream.end();
        await Promise.all(Proccess).then(r => {
            if(r) {
                this.log('Icon fonts successfully generated!');
            }
        }).catch(e => {
            console.log(e);
        })
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
        let models = this.collection.filter(m=>m.has('svg'));
        if(models.length) {
            let icons = models.map(model=>model.toJSON());
            this.renderMaster.add({
                description: `font icons: ${_.pluck(icons, 'id').join(', ')} to render`,
                models,
                type: 'fonts'
            });
        } else if(this.iconsStorage['fonts']) {
            let ids = _.map(this.iconsStorage['fonts'].models, model => model.get('id'));
            delete this.iconsStorage['fonts'];
            this.emit('icons', {
                type: 'fonts',
                ids,
                date: new Date
            });
        }
    }
    allSVGToRender() {
        let config = this.config;
        let models = this.collection.filter(m=>m.has('svg'));
        if(models.length) {
            let icons = models.map(model=>model.toJSON());
            this.renderMaster.add({
                description: `svg icons: ${_.pluck(icons, 'id').join(', ')} to render`,
                models,
                type: 'svg_sprite'
            });
        } else if(this.iconsStorage['svg_sprite']) {
            let ids = _.map(this.iconsStorage['svg_sprite'].models, model => model.get('id'));
            delete this.iconsStorage['svg_sprite'];
            this.emit('icons', {
                type: 'svg_sprite',
                ids,
                date: new Date
            });
        }
    }
    allSpritesToRender() {
        let config = this.config;
        if(config.sprites.enabled) {
            let models = [];
            models = this.collection.filter(m=> !m.has('svg'));
            if(models.length) {
                let icons = models.map(model=>model.toJSON());
                this.renderMaster.add({
                    description: `sprites to render`,
                    models,
                    type: 'sprite'
                });
            } else if(this.iconsStorage['sprite']) {
                let ids = _.map(this.iconsStorage['sprite'].models, model => model.get('id'));
                delete this.iconsStorage['sprite'];
                this.emit('icons', {
                    type: 'sprite',
                    ids,
                    date: new Date()
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

        try {
            if(config.icons_mode == 'fonts') {
                this.allFontsToRender();
            } else {
                this.allSVGToRender();
            }
            this.allSpritesToRender();
        } catch(e) {
            console.log(e);
        }
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
        let dom = new JSDOM('<svg class="ungic-svg-sprite" style="display:none"></svg>');
        let svg = dom.window.document.querySelector('svg.ungic-svg-sprite');

        for(let model of models) {
            let symbol = this.getSymbol(model, true);
            svg.appendChild(symbol);
        }
        if(config.svg_sprites.external || this.skipIconsEvent) {
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
        let config = this.config;
        let svg =  model.has('svg');
        if(!svg) {
            return this.getHTMlSpriteIcon(model, options);
        } else {
            if(config.icons_mode == 'fonts') {
                return this.getHTMlFontIcon(model, options);
            } else {
                return this.getHTMLSvgSprite(model, options);
            }
        }
    }
    async generateSprite(models) {
        if(!models.length) {
            this.warning('No images');
            return
        }
        let config = this.config;

        let res = await new Promise((done, rej) => {

            let sprites = _.map(models, model => model.get('finalPath'));
            /*
            *   Пробежать и срезать размер в тем папку и сохранить все ссылки, отправить в смитх и затем временные крякнуть*
            */
            Spritesmith.run({src: sprites}, async (err, result) => {
                 try {
                    if(err) {
                        this.log(err);
                    } else {
                        let distPath = path.join(this.spritesDist, config.sprites.className + '.png');

                        await fse.outputFile(distPath, result.image);
                        let coordinates = result.coordinates;
                        let storage = [];


                        for(let ph in coordinates) {

                            let model = this.collection.find(model => model.has('finalPath') && path.normalize(model.get('finalPath')) == path.normalize(ph)); // path.join(path.sep, path.normalize(ph).split(this.root)[1]) == path.join(path.sep, path.normalize(model.get('path')))
                            storage.push({
                                id: model.id,
                                //className: model.get('className'),
                                name: model.get('name'),
                                coordinates: coordinates[ph]
                            });
                        }

                        let sassOut = await this.generateSpriteSass(storage);

                        if(!this.skipIconsEvent) {
                            this.emit('icons', {
                                type: 'sprite',
                                models,
                                date: new Date,
                                data: {
                                    icons: storage,
                                    sass: sassOut,
                                    dist: distPath,
                                    dist_url: path.relative(path.join(this.dist, config.fs.dist.css), distPath).replace(/\\+/g, '/')
                                }
                            });
                        } else {
                            let renderConfig = {
                                data: sassOut + ' @include render();'
                            }
                            try {
                                let css = await new Promise((ready, rej) => {
                                    sass.render(renderConfig, (err, result) => {
                                        if(err) {
                                            console.log(err);
                                            this.error(err.message);
                                            return ready(false);
                                        }
                                        ready(result.css);
                                    });
                                });
                                if(!css) {
                                    this.error('Icon sass generation error');
                                }
                                await fse.outputFile(path.join(this.dist, config.fs.dist.css, config.sprites.className  + '.css'), css);
                            } catch(e) {
                                console.log(e);
                            }
                        }
                        this.log('Sprites successfully generated!');
                    }
                    done();
                } catch(e) {
                    console.log(e);
                }
            });
        });


        return res;
    }
    hasIcon(data) {
        return this.collection.findWhere(data);
    }
    generateSvgSprite(models) {
        if(!models.length) {
            this.warning('No icons');
            return
        }
        let config = this.config;
        try {
            let sprite = this.getSvgSprite(models);
            if(!this.skipIconsEvent) {
                this.emit('icons', {
                    type: 'svg_sprite',
                    models,
                    date: new Date,
                    data: {
                        icons: _.map(models, m => _.omit(m.toJSON(), 'svg')),
                        sprite,
                        external: config.svg_sprites.external,
                    }
                });
            }
            this.log('Svg sprite successfully generated!');
        } catch(e) {
            console.log(e);
        }
    }
    async begin() {
        try {
            await this.renderMaster.run();
        } catch(e) {
            console.log(e);
        }
        //console.log(this.collection.toJSON());
        this.emit('begined', this.iconsStorage);
    }
}

module.exports = iconsPlugin;