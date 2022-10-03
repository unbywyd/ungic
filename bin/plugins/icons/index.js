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
const {extend: Collection} = require('../../modules/collection-sync');
const {extend: Model} = require('../../modules/model');
const SVGO = require('svgo');
const cheerio = require('cheerio');
const svgicons = require('svgicons2svgfont');
const svg2ttf = require('svg2ttf');
const ttf2eot = require('ttf2eot');
const ttf2woff = require('ttf2woff');
const ttf2woff2 = require('wawoff2');
const stream = require('stream');
const moment = require('moment');
const watchGrouping = require('../../modules/watch-grouping');
const hbs = require('handlebars');
const sass = require('sass');
const spriteSmith = require('spritesmith');
const resizeImg = require('resize-img');
var sizeOf = require('image-size');
const {urlJoin} = require('../../modules/url-join');

hbs.registerHelper("coordinate", function(val) {
    return !val ? val : val * -1 + 'px';
});

class builder extends skeleton {
    constructor(scheme, config={}) {
        super(scheme, {objectMerge: true}, config);
    }
}

let codepointManager = function(parent) {
    this.storage = [];
    this.codepoints = [];
    this.parent = parent;
    this.cacheFile = path.join(parent.project.root, parent.config.fs.dirs.temp, 'cache.codepoints');
    this.tempDir = path.join(parent.project.root, parent.config.fs.dirs.temp);
}
codepointManager.prototype.init = async function() {
    if(await fsp.exists(this.cacheFile)) {
       try {
            let icons = await fsp.readFile(this.cacheFile, 'UTF-8');
            icons = JSON.parse(icons);
            let saveIcons = [];
            for(let icon of icons) {
                let iconPath = path.join(this.parent.root, icon.path);
                if(await fsp.exists(iconPath)) {
                    saveIcons.push(icon);
                }
            }
            this.storage = saveIcons;
            this.codepoints = _.uniq(_.pluck(saveIcons, 'codepoint'));
            await fsp.writeFile(this.cacheFile, JSON.stringify(saveIcons));
       } catch(e) {
            //console.log(e);
       }
    }
}
codepointManager.prototype.save = async function(collection) {
    let icons = collection.map(model => _.pick(model.toJSON(), 'id', 'codepoint', 'path'));
    if(!await fsp.exists(this.tempDir)) {
        await fse.ensureDir(this.tempDir);
    }
    this.storage = icons;
    this.codepoints = _.uniq(_.pluck(_.filter(icons, i => i.codepoint), 'codepoint'));
    await fsp.writeFile(this.cacheFile, JSON.stringify(icons));
}
codepointManager.prototype.saveCodepoint = function(codepoint) {
    if(this.codepoints.indexOf(codepoint) == -1) {
        this.codepoints.push(codepoint);
    }
}
codepointManager.prototype.get = function(iconData) {
    let collection = this.parent.collection;
    if(iconData.codepoint) {
        let inProject = collection.findByID(iconData.id);
        if((inProject && inProject.codepoint == iconData.codepoint) || !inProject) {
            this.saveCodepoint(iconData.codepoint);
            return iconData.codepoint;
        }
    }
    let prev = this.storage.find(e => e.id == iconData.id);
    if(prev && !collection.find(model => model.get('codepoint') == prev.codepoint)) {
        return prev.codepoint;
    }
    let config = this.parent.config;
    let codepoint = config.startCodepoint;
    if(this.codepoints.length) {
        codepoint = Math.max(...this.codepoints);
        codepoint += 1;
    }
    this.saveCodepoint(codepoint);
    return codepoint;
}

class iconsPlugin extends plugin {
    constructor(config={}, sysconfig={}) {
        config.id = 'icons';
        super(require('./model-scheme'), config, sysconfig);
        this.codepoints = [];
        this.watchController = new watchGrouping();
        this.watchController.on('ready', events => {                
            this.fileChanged(events);    
        });
        this.iconsStorage = {};
        let model = Model({
            id: {
                type: 'string',
                required: true
            },
            sourcename: {
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

        let optimaze = {
            plugins: [
                {removeUselessDefs: false},
                {inlineStyles: false},
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
                {mergePaths:false}
            ]
        }

        if(config.svgSprite.removeColors) {
            optimaze.plugins.push({
                removeAttrs: {
                    attrs: '(fill|stroke)'
                }
            });
        }

        this.svgo = new SVGO(optimaze);

        this.fontsDist = path.join(this.dist, config.fs.dist.fonts);
        this.spritesDist = path.join(this.dist, config.fs.dist.img, 'sprites');

        this.fontsDistRelative = config.fs.dist.fonts;
        this.spritesDistRelative = path.join(config.fs.dist.img, 'sprites');

        let collection = Collection(model);

        this.collection = new collection();
        this.cpManager = new codepointManager(this);

        this.collection.on('all', (event, model) => {
            if(event == 'updated' || event == 'added' || event == 'removed') {
                if(model.has('svg')) {
                    if(this.buildConfig.svgIcons) {
                        if(this.buildConfig.svgIconsMode == 'fonts') {
                            this.allFontsToRender();
                        } else {
                            this.allSVGToRender();
                        }
                    }
                } else if(this.buildConfig.sprites) {
                    this.allSpritesToRender();
                }
            } else if(event == 'add') {
                let hasSvg = _.find(model, m => m.model.has('svg'));
                if(hasSvg) {
                    if(this.buildConfig.svgIcons) {
                        if(this.buildConfig.svgIconsMode == 'fonts') {
                            this.allFontsToRender();
                        } else {
                            this.allSVGToRender();
                        }
                    }
                } else if(this.buildConfig.sprites) {
                    this.allSpritesToRender();
                }
            }
        });

        let iconsTimer;

        this.on('icons', data => {
            this.iconsStorage[data.type] = data;            
            clearTimeout(iconsTimer);
            iconsTimer = setTimeout(() => {            
                this.generateHTMLPage();
            }, 100);
        });

        this.renderMaster = new renderMaster(_.extend(config.render, {
            id: this.id
        }), this.render.bind(this));
        this.renderMaster.on('log', (type, message) => {
            if(this.project.config.verbose) {
                this.log(message, type);
            }
        });
        hbs.registerHelper("icons_icon", (id, context) => {
            let iconRendered = this.getIconForRender(id);
            if(iconRendered) {
                return iconRendered;
            }
            return '';
        });
    }
    async render(events) {
        this.emit('render');
        for(let event of events) {
            if(event.type == 'fonts') {
                await this.fontGeneration(_.sortBy(event.models, model => model.get('id')));
            }
            if(event.type == 'svgSprite') {
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
        if(!this.begined) {
            this.begined = true;
            this.emit('begined', this.iconsStorage);
        }
        await this.cpManager.save(this.collection);        
        this.emit('rendered');
    }
    rebuild() {
        if(this.collection.size()) {
            let icons = this.collection;
            let hasSvg = icons.find(m => m.has('svg')), hasSprites = icons.find(m => !m.has('svg'));
            if(hasSprites) {
                this.allSpritesToRender();
            }
            if(hasSvg) {
               if(this.buildConfig.svgIconsMode == 'fonts') {
                    this.allFontsToRender();
                } else {
                    this.allSVGToRender();
                }
            }
        } else {
            this.system(`No icons`);
        }
    }
    async generateIconsJS(models) {
        let template = path.join(__dirname, 'templates', 'iconsJs.hbs');
        template = await fsp.readFile(template, 'UTF-8');
        if(models.size()) {
            let icons = models.toJSON();
let data = `
export const icons = ${JSON.stringify(icons)};
export const iconsMode = '${this.buildConfig.svgIconsMode}';
export const config = ${JSON.stringify(this.config)};
export const fontConfig = ${JSON.stringify(this.fontConfiguration())};
export const svgSprite = \`${this.getSvgSprite(this.collection.filter(m => m.has('svg'), true))}\`;
`;
           let iconsRendered = '';

           for(let icon of models.toJSON()) {
            iconsRendered += `\nexport const icon_${icon.id} = \`${this.getIconForRender(icon.id)}\`;`;
           }
           let output = data + '\n' + template + iconsRendered;
           await fse.outputFileSync(path.join(this.dist, 'exports', 'ungic-icons.module.js'), output);
        }
        
    }
    async generateHTMLPage(data={}) {
        let template = path.join(__dirname, 'templates', 'icons.hbs');
            template = await fsp.readFile(template, 'UTF-8');
        let source = {
            address: this.project.fastify.address,
            icons: {}
        }

        source.release = this.releaseData;
        let config = this.config;
        
        if(this.collection.size()) {
            // Generate Icons JS
            try {
                await this.generateIconsJS(this.collection);
            } catch(e) {
                console.log(e);
            }

            if(data.svgSpriteData && data.svgSpriteData.sprite  && !config.svgSprite.external) {
                source.svgSprite = data.svgSpriteData.sprite;
            }
            if(this.releaseData) {
                source.stylesheets = [];
                if(data.fontsData) {
                    source.stylesheets.push({href: data.fontsData.css_url});
                }
                if(data.spritesData) {
                    source.stylesheets.push({href: data.spritesData.css_url});
                }

                let hasSvg = this.releaseData.svgIcons, hasSprites = this.releaseData.sprites;
                if(hasSvg) {                    
                    if(this.buildConfig.svgIconsMode == 'fonts') {
                        source.icons.fonts = this.releaseData.svgIcons.map(m => m.toJSON());
                    } else {
                        source.icons.svgSprite = this.releaseData.svgIcons.map(m => m.toJSON());
                    }
                }
                if(hasSprites) {                    
                    source.icons.sprites = this.releaseData.sprites.map(m => m.toJSON());
                }                
            } else {               
                if(this.iconsStorage.svgSprite && this.iconsStorage.svgSprite.data  && !config.svgSprite.external) {
                    source.svgSprite = this.iconsStorage.svgSprite.data.sprite;
                }         
                let hasSvg = this.collection.find(m => m.has('svg')), hasSprites = this.collection.find(m => !m.has('svg'));

                if(hasSvg) {
                    let icons = this.collection.filter(m => m.has('svg'));
                    if(this.buildConfig.svgIconsMode == 'fonts') {
                        source.icons.fonts = icons;
                    } else {
                        source.icons.svgSprite = icons;
                    }
                }

                if(hasSprites) {
                    let icons = this.collection.filter(m => !m.has('svg'));
                    source.icons.sprites = icons;
                }
            }
        } else {
            source.icons = false;
        }

        try {
            let doc = hbs.compile(template)(source);
            await fse.outputFile(path.join(this.dist, 'demo-icons.html'), doc);
        } catch(e) {
            console.log(e);
        }
        return
    }
    async fileChanged(events) {
        let paths = [], spriteRemoved, svgRemoved;
        for(let event in events) {
            for(let ev of events[event]) {
              if(event == 'unlink') {  
                if(path.extname(ev.path) != '.svg') {
                    spriteRemoved = true;
                } else {
                    svgRemoved = true;
                }          
                await this.setEntityByPath(path.relative(this.root, ev.path), {silent:true, unlink: true});                
              } else {
                await this.setEntityByPath(path.relative(this.root, ev.path), {silent:true});                
              }
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
            if(this.buildConfig.svgIconsMode == 'fonts') {
                this.allFontsToRender();
            } else {
                this.allSVGToRender();
            }
        }
  
        if(!this.collection.size()) {
            await this.generateHTMLPage();
        }       
    }
    async setEntityByPath(ph, options={}) {
        let supports = ['png', 'svg', 'jpeg', 'jpg'];
        let config = this.config;
        let extname = path.extname(ph).replace('.', '');
        if(supports.indexOf(extname) == -1) {
            return this.error(`.${extname} files are not supported. ${path.basename(ph)} will be skipped.`);
        }

        let fullPath = path.join(this.root, ph);
        if(!await fsp.exists(fullPath) || options.unlink) {            
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
            sourcename: path.basename(ph, path.extname(ph)),
            id: extname == 'svg' ? ph.replace(path.extname(ph), '').replace(/[^\w]+/g, '_') : ph.replace(/[^\w]+/g, '_'),
            path: path.normalize(ph)
        }

        if(extname == 'svg') {
            let svgSource = await fsp.readFile(fullPath, 'UTF-8');
            try {
                svgSource = await this.svgo.optimize(svgSource);
                let $ = cheerio.load(svgSource.data);
                let $svg = $('svg');
                $svg.attr('id', entityData.id);
                $svg.removeAttr('data-name');
                $svg.removeAttr('style');
                $svg.find('symbol').each(function() {
                    $(this).before($(this).html());
                    $(this).remove();
                });

                if(config.svgSprite.removeColors) {
                    $svg.find('[style*="color"], [style*="fill"], [style*="stroke"]').each(function() {
                        $(this).css({color:'', fill: '', stroke: ''});
                    });
                }

                $svg.find('g').each(function() {
                    if($(this).html().trim() == '') {
                        $(g).remove();
                    }
                });
                let title = $svg.find('title');
                if(title) {
                    entityData.title = title.textContent;
                    title.remove();
                }             
                entityData.svg = $svg.parent().html();
                entityData.codepoint = this.getCodepoint(entityData);
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
        let config = this.config;
        let $domSvgOrigin = cheerio.load(model.get('svg'));
        let $svgOrigin = $domSvgOrigin('svg');


        let $dom = cheerio.load('<svg class="ungic-icon" role="img"></svg>');
        let $svg = $dom('svg');
        let title = model.get('name');
        if(options.title) {
            title = options.title;
        }
        let className = config.svgSprite.className;
        let uniqid = this.uniqid();
        if(!options.presentation && title) {
            $svg.attr('aria-labelledby', uniqid);
            $svg.append(`<title id="${uniqid}">${title}</title>`);
        } else if(!title || options.presentation) {
            $svg.attr('aria-hidden', true);
        }
        let url = '#' + className + '-' + model.get('id');
        if(config.svgSprite.external && !this.releaseData) {
            url = 'exports/ungic-sprite.svg' + url;
            if(!options.relativeSrc) {
                url = this.project.fastify.address + '/' + url;
            }
        } else if(this.releaseData && config.svgSprite.external) {
            let prefix = this.buildSuffix != '' ? (this.buildSuffix + '-') : '';            
            url = '/exports/' + prefix + 'ungic-sprite.svg' + url;
            let host = this.releaseData.host;       
            if(host != '') { 
                url = urlJoin(host, url);
            }
        }
        $svg.append(`<use xlink:href="${url}" />`);
        if(config.svgSprite.external) {
            $svg.attr('viewBox', $svgOrigin.attr('viewBox'));
        }
        if(config.svgSprite.width) {
            $svg.attr('width', options.width ? options.width : config.svgSprite.width);
        }
        if(config.svgSprite.height) {
            $svg.attr('height', options.height ? options.height : config.svgSprite.height);
        }
        if(options.size) {
            $svg.attr('width', options.size);
            $svg.attr('height', options.size);
        }
        if(options.class && options.class.length) {
            for(let cl of options.class.split(',')) {
                if(cl.trim() != "") {
                    $svg.addClass(cl.trim());
                }
            }
        }
        let svg = $svg.parent().html();

      
        if(options.href) {
            let attrs = '';
            if(options.presentation) {
                attrs = 'aria-hidden="true"';
            }   
            return `<a ${attrs} href="${options.href}">${svg}</a>`;
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
        
        if(title) {            
            let classTitle = [];         
            classTitle.push(`${fontConfig.font.class}-label`);

            let attrs = '';
            if(options.presentation) {
                attrs = 'aria-hidden="true"';
            }            
            title = `<span ${attrs} class="${classTitle.join(' ')}">${title}</span>`;
        }  
  
        let classes = "";
        if(options.class) {
            classes = options.class;
        }

        let config = this.config;
        if(!config.fonts.lables) {
           title = '';
        }
      
        if(options.href) {
            return `<a href="${options.href}"><i aria-hidden="true" class="${classes} ${fontConfig.font.class} ${fontConfig.font.class}-${model.get('id')}"></i>${title}</a>`;
        } else {
            return `<i aria-hidden="true" class="${classes} ${fontConfig.font.class} ${fontConfig.font.class}-${model.get('id')}"></i>${title}`;
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
        
        if(options.presentation) {
            title = `<span aria-hidden=true" class="${config.sprites.className}-label">${title}</span>`;
        } else {
            title = `<span class="${config.sprites.className}-label">${title}</span>`;
        }
       
        let classes = "";
        if(options.class) {
            classes = options.class;
        }       
        if(options.href) {
            return `<a href="${options.href}"><i aria-hidden="true" class="${classes} ${config.sprites.className}-${model.get('id')}"></i>${title}</a>`;
        } else {
            return `<i aria-hidden="true" class="${classes} ${config.sprites.className}-${model.get('id')}"></i>${title}`;
        }
    }
    getSymbol(id) {
        let model = id;
        if(typeof id != 'object') {
            model = this.collection.findByID(id);
        }
        let config = this.config;
        let svgSource = model.get('svg');
        let $dom = cheerio.load(svgSource);
        let $svg = $dom('svg');
        let $domSymbol = cheerio.load('<symbol></symbol>');
        let $symbol = $domSymbol('symbol');
        $symbol.attr('xmlns', $svg.attr('xmlns') ? $svg.attr('xmlns') : 'http://www.w3.org/2000/svg');
        $symbol.attr('viewBox', $svg.attr('viewBox'));
        $symbol.attr('fill', 'currentcolor');

        $symbol.attr('id', config.svgSprite.className + '-' + $svg.attr('id'));
        if($svg.attr('class')) {
            $symbol.attr('class', $svg.attr('class'));
        }
        $symbol.html($svg.html());
        return $symbol.parent().html();
    }
    fontConfiguration() {
        let config = this.config;
        let prefix = this.buildSuffix != '' ? (this.buildSuffix + '-') : '';
        return {
            font: {
                name: prefix + config.fonts.name,
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
        let toPath = relativePath ? path.join(this.dist, 'exports', relativePath) : path.join(this.dist, 'exports');

        if(path.extname(toPath) == '') {
            toPath = path.join(toPath, 'ungic-icons.json');
        }

        if(await fsp.exists(toPath)) {
            const stat = await fsp.lstat(toPath);
            if(!stat.isFile()) {
                toPath = path.join(toPath, 'ungic-icons.json');
            }
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
    async release(releaseData) {
        if(Array.isArray(releaseData.svgIcons)) {
            releaseData.svgIcons = _.map(releaseData.svgIcons, id => this.collection.get(id));
        }
        if(Array.isArray(releaseData.sprites)) {
            releaseData.sprites = _.map(releaseData.sprites, id => this.collection.get(id));
        }
        let results = {
            releases: []
        }        
        let {version, releaseName, svgIconsMode} = releaseData;
        let currentBuild = this.buildConfig;
        this.buildConfig = releaseData;
        releaseData.type = svgIconsMode;
        let dist = this.dist;
        let fontsDist = this.fontsDist;
        let spritesDist = this.spritesDist;
        let config = this.config;
        let svgSpriteData, fontsData, spritesData;
        this.dist =  releaseData.outputReleasePath;
        this.fontsDist = path.join(this.dist, config.fs.dist.fonts);
        this.spritesDist = path.join(this.dist, config.fs.dist.img, 'sprites');
        this.skipIconsEvent = true;
        this.releaseData = releaseData;
        this.buildSuffix = '';
        if(!releaseData.combineIcons) {
            this.buildSuffix = releaseData.filename ? releaseData.filename : releaseData.releaseName;
        }
        
        this.buildSuffix = this.buildSuffix + (releaseData.noConflict ? 'v' + moment().unix() : '');
        try {
            if(releaseData.svgIcons && Array.isArray(releaseData.svgIcons)) {
                let icons = releaseData.svgIcons;
                if(svgIconsMode == 'fonts') {
                    fontsData = await this.fontGeneration(icons);
                    results.releases.push(fontsData);
                } else {
                    svgSpriteData = this.generateSvgSprite(icons);
                    results.releases.push(svgSpriteData);
                }
                let toExport = _.filter(icons, i => i.has('svg'));
                let suffix = this.buildSuffix != '' ? (this.buildSuffix + '-') : '';
                let exportFilename = `${suffix}ungic-icons.json`;
                if(toExport.length) {
                    let ids = _.pluck(toExport, 'id');
                    await this.exportIcons(ids,  exportFilename);
                }
                results.exportFile = path.join(this.dist, 'exports', exportFilename);
            }
       
            if(releaseData.sprites && Array.isArray(releaseData.sprites)) {
                let icons = releaseData.sprites;
                spritesData = await this.generateSprite(icons);
                results.releases.push(spritesData);
            }
            await this.generateHTMLPage({svgSpriteData, fontsData, spritesData});
        } catch(e) {
            this.system('Build error:' + e.message, 'error');
            return false;
        }
        this.buildConfig = currentBuild;
        this.buildSuffix = '';
        this.system(`${releaseData.type} release successfully generated to ${this.dist}`);
        this.dist = dist;
        this.fontsDist = fontsDist;
        this.spritesDist = spritesDist;
        delete this.skipIconsEvent;
        delete this.releaseData;
        return results;
    }
    getIconsList(onlySvg) {
        let models = this.collection.get();
        if(!models.length) {
            return [];
        }

        models = _.filter(models, m => {
            if(onlySvg && m.has('svg') || !onlySvg && !m.has('svg')) {
                return m;
            }
        });
        return _.map(models, model => model.toJSON());
    }
    async importIcons(relativePath, saveIts) {
        let toPath = relativePath ? path.join(this.dist, relativePath) : path.join(this.dist);

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
            if(icon.path) {
                let toExt = path.join(this.root, icon.path);
                if(!await fsp.exists(toExt)) {
                    saveIts = true;
                }
                if(saveIts) {
                    await fse.outputFile(toExt, icon.svg);
                }
            }
            if(active && active.get('svg') != icon.svg || !active) {
                icon.codepoint = this.getCodepoint(icon);
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
    generateDistSrc(relativePath) {   
        /*
        *   Для облегчения задачи, будем возвращать путь относительно корня проекта, а не CSS файла.
        */
       if(!this.releaseData) {     
           return urlJoin(this.project.fastify.address, relativePath);
        }
        let host = this.releaseData.host;
        if(host != '') { 
            return urlJoin(host, relativePath);
        } else {
            return urlJoin('/', relativePath);
        }
    }
    getPathToCSS() {
        let config = this.config;
        if(this.releaseData && this.releaseData.includeLocalStyles) {
            return '/';
        }
        return config.fs.dist.css;
    }
    async generateSpriteSass(icons) {       
        let template = path.join(__dirname, 'templates', 'sprites_sass.hbs');
        let config = this.config;
        let prefix = this.buildSuffix != '' ? (this.buildSuffix + '-') : '';
        let source = {
            config: {
                className: config.sprites.className
            },
            icons,
            path: this.generateDistSrc(path.join(this.spritesDistRelative, prefix + config.sprites.className + '.png'))
        }
        template = await fsp.readFile(template, 'UTF-8');    
        let content = hbs.compile(template)(source);
        return content;
    }
    async getFontsSass(models) {
        let template = path.join(__dirname, 'templates', 'fonts_sass.hbs');        
        let source = {
            config: this.fontConfiguration(),
            icons: _.map(models, m => {
                let data = _.omit(m.toJSON(), 'svg');
                data.unicode = data.codepoint.toString(16);
                return data;
            }),
            fonts_path: this.generateDistSrc(path.join(this.fontsDistRelative, '/'))
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
        try {
            let sassSource = await this.getFontsSass(this.iconsStorage.fonts.models, true);
            if(!this.lastFontsCSSGeneratedDate || this.lastFontsCSSGeneratedDate != this.iconsStorage.fonts.date) {
                this.lastFontsCSSGeneratedDate = this.iconsStorage.fonts.date;
                let result = sass.renderSync({data:`${sassSource} @include render();`});
                this.lastFontsCSS = result.css.toString();
                return this.lastFontsCSS;
            } else {
                return this.lastFontsCSS;
            }
        } catch(e) {
            console.log(e);
            return '';
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
        let sassSource = await this.generateSpriteSass(this.iconsStorage.sprite.data.icons);
        if(!this.lastSpritesCSSGeneratedDate || this.lastSpritesCSSGeneratedDate != this.iconsStorage.sprite.date) {
            this.lastSpritesCSSGeneratedDate = this.iconsStorage.sprite.date;
            try {
                let result = sass.renderSync({data:`${sassSource} @include render();`});
                this.lastSpriteCSS = result.css.toString();
                return this.lastSpriteCSS;
            } catch(e) {
                console.log(e);
            }
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
        let callbackData = {
            type: 'fonts',
            icons: _.map(models, m => _.omit(m.toJSON(), 'svg')),
            config: fontConfig,
            sass: sassSource
        }
        let prefix = this.buildSuffix != '' ? (this.buildSuffix + '-') : '';
        let relativePath = path.join(this.getPathToCSS(), prefix + 'fonts-' + config.fonts.name  + '.css');
        callbackData.css_url = this.generateDistSrc(relativePath);


        if(!this.skipIconsEvent) {
            this.emit('icons', {
                type: 'fonts',
                models,
                date: new Date,
                data: callbackData
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
            callbackData.styles = css;
            if(!this.releaseData || (this.releaseData && !this.releaseData.includeLocalStyles)) {
                await fse.outputFile(path.join(this.dist, relativePath), css);
            }
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

        let streamPath = path.join(this.fontsDist, fontConfig.font.name + '.svg');
        if(!await fsp.exists(streamPath)) {
            await fse.outputFile(streamPath, '');
        }
        let Proccess = [];
        Proccess.push(new Promise((done, rej) => {
            fontStream.pipe(fs.createWriteStream(streamPath)).on('finish', async() => {
                let svgs = Buffer.concat(svgStreams);
                let ttf = svg2ttf(svgs.toString());
                try {
                    await fse.outputFile(path.join(this.fontsDist, fontConfig.font.name + '.woff2'), Buffer.from(await ttf2woff2.compress(ttf.buffer)));
                    await fse.outputFile(path.join(this.fontsDist, fontConfig.font.name + '.woff'), Buffer.from(ttf2woff(ttf.buffer).buffer));
                    await fse.outputFile(path.join(this.fontsDist, fontConfig.font.name + '.eot'), Buffer.from(ttf2eot(ttf.buffer).buffer));
                    await fse.outputFile(path.join(this.fontsDist, fontConfig.font.name + '.ttf'), Buffer.from(ttf.buffer));
                } catch(e) {
                  this.log(e);
                }
                done(true);
            }).on('error', (err) => {
                this.log(err);
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
                this.system('Font icons successfully generated!');
            }
        }).catch(e => {
            console.log(e);
        })
        return callbackData;
    }
    getCodepoint(data) {
        return this.cpManager.get(data);
    }
    allFontsToRender() {
        if(this.buildConfig.svgIcons) {
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
    }
    allSVGToRender() {
        if(this.buildConfig.svgIcons) {
            let models = this.collection.filter(m=>m.has('svg'));
            if(models.length) {
                let icons = models.map(model=>model.toJSON());
                this.renderMaster.add({
                    description: `svg icons: ${_.pluck(icons, 'id').join(', ')} to render`,
                    models,
                    type: 'svgSprite'
                });
            } else if(this.iconsStorage['svgSprite']) {
                let ids = _.map(this.iconsStorage['svgSprite'].models, model => model.get('id'));
                delete this.iconsStorage['svgSprite'];
                this.emit('icons', {
                    type: 'svgSprite',
                    ids,
                    date: new Date
                });
            }
        }
    }
    allSpritesToRender() {
        if(this.buildConfig.sprites) {
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
        if(this.project.config.build.plugins[this.id]) {
            try {
                this.builder = new builder(require('./build.model-scheme'), this.project.config.build.plugins[this.id]);
            } catch(e) {
                return this.system('Icons build scheme incorrect. Origin: \n' + e.message, 'error', {exit: true});
            }
        }

        this.buildSuffix = '';

        await this.cpManager.init();
        let files = await fg('**/*.{svg,png,jpeg,jpg}', {dot: false, cwd: this.root, deep: 10});
        if(files.length) {
            for(let svg of files) {
                await this.setEntityByPath(svg, {silent: true});
            }
        }
        this.buildConfig = this.builder.config.dev;
        try {
            if(this.buildConfig.svgIconsMode == 'fonts') {
                this.allFontsToRender();
            } else {
                this.allSVGToRender();
            }
            this.allSpritesToRender();
        } catch(e) {
            console.log(e);
        }
        this.on('watcher', (event, rp, ph) => {
            rp = path.normalize(rp).replace(/^[\\\/]+/, '');

            if(rp.indexOf(path.normalize(this.relativePath).replace(/^[\\\/]+/, '')) !== 0) {
                return
            }

            let supports = ['.png', '.svg', '.jpeg', '.jpg'];
            if(supports.indexOf(path.extname(ph)) != -1) {
                this.watchController.emit('bind', event, ph);
            }
        });
    }
    getSvgSprite(models, noFile) {
        let config = this.config;
        if(!models.length) {
            this.warning('No icons');
            return
        }
        let $dom = cheerio.load('<svg class="ungic-svg-sprite" style="display:none"></svg>');
        let $svg = $dom('svg');

        for(let model of models) {
            $svg.append(this.getSymbol(model));
        }
        let svgContent = $svg.parent().html();
       
       if(!noFile) { 
            let prefix = this.buildSuffix != '' ? (this.buildSuffix + '-') : '';
            if(this.releaseData) {
                fse.outputFileSync(path.join(this.dist, 'exports', prefix + 'ungic-sprite.svg'), svgContent);
            } else {
                fse.outputFileSync(path.join(this.dist, 'exports', 'ungic-sprite.svg'), svgContent);
            }
        }
        return svgContent;
    }
    getIconForRender(id, options={}) {
        let model = this.collection.findByID(id);
        if(!model) {
            this.error(`getIconForRender error. ${id} icon not exists`);
            return
        }
        //let config = this.config;
        let svg =  model.has('svg');
        if(!svg) {
            return this.getHTMlSpriteIcon(model, options);
        } else {
            if(this.buildConfig.svgIconsMode == 'fonts') {
                return this.getHTMlFontIcon(model, options);
            } else {
                return this.getHTMLSvgSprite(model, options);
            }
        }
    }
    async generateSprite(models) {
        if(!models.length) {
            if(!this.skipIconsEvent) {
                this.warning('No images');
            }
            return {};
        }
        let config = this.config;
        let callbackData = {};
        let prefix = this.buildSuffix != '' ? (this.buildSuffix + '-') : '';
        await new Promise((done, rej) => {
            let sprites = _.map(models, model => model.get('finalPath'));
            /*
            *   Пробежать и срезать размер в тем папку и сохранить все ссылки, отправить в смитх и затем временные крякнуть*
            */
           spriteSmith.run({src: sprites}, async (err, result) => {
                 try {
                    if(err) {
                        this.log(err);
                    } else {
                        let distPath = path.join(this.spritesDist, prefix + config.sprites.className + '.png');

                        await fse.outputFile(distPath, result.image);
                        let coordinates = result.coordinates;
                        let storage = [];

                        for(let ph in coordinates) {

                            let model = this.collection.find(model => model.has('finalPath') && path.normalize(model.get('finalPath')) == path.normalize(ph)); // path.join(path.sep, path.normalize(ph).split(this.root)[1]) == path.join(path.sep, path.normalize(model.get('path')))
                            storage.push({
                                id: model.id,
                                name: model.get('name'),
                                coordinates: coordinates[ph]
                            });
                        }

                        let sassOut = await this.generateSpriteSass(storage);

                        callbackData = {
                            type: 'sprites',
                            icons: storage,
                            sass: sassOut,
                            //dist: distPath,
                            //dist_url: this.generateDistSrc(distPath)
                            //path.relative(path.join(this.dist, this.getPathToCSS()), distPath).replace(/\\+/g, '/')
                        }
                        //let prefix = this.buildSuffix != '' ? (this.buildSuffix + '-') : '';
                        let relativePath = path.join(this.getPathToCSS(), prefix + 'sprites-' + config.sprites.className  + '.css');
                        callbackData.css_url = this.generateDistSrc(relativePath);   
                        //path.join(this.getPathToCSS(), ).replace(/\\+/g, '/');

                        if(!this.skipIconsEvent) {
                            this.emit('icons', {
                                type: 'sprite',
                                models,
                                date: new Date,
                                data: callbackData
                            });
                        } else {
                            let renderConfig = {
                                data: sassOut + ' @include render();'
                            }
                            try {
                                let css = await new Promise((ready, rej) => {
                                    sass.render(renderConfig, (err, result) => {
                                        if(err) {
                                            this.error(err.message);
                                            return ready(false);
                                        }
                                        ready(result.css);
                                    });
                                });
                                if(!css) {
                                    this.error('Icon sass generation error');
                                }
                                callbackData.styles = css;
                                if(!this.releaseData || (this.releaseData && !this.releaseData.includeLocalStyles)) {
                                    await fse.outputFile(path.join(this.dist, relativePath), css);
                                }
                            } catch(e) {
                                console.log(e);
                            }
                        }
                        this.system('Sprites successfully generated!');
                    }
                    done();
                } catch(e) {
                    console.log(e);
                }
            });
        });
        return callbackData;
    }
    hasIcon(data) {
        return this.collection.findWhere(data);
    }
    generateSvgSprite(models) {
        if(!models.length) {
            if(!this.skipIconsEvent) {
                this.warning('No icons');
            }
            return {};
        }
        let config = this.config;
        let callbackData = {};
        try {
            let sprite = this.getSvgSprite(models);
            callbackData = {
                type: 'svgSprite',
                icons: _.map(models, m => _.omit(m.toJSON(), 'svg')),
                sprite,
                external: config.svgSprite.external,
            }
            if(!this.skipIconsEvent) {
                this.emit('icons', {
                    type: 'svgSprite',
                    models,
                    date: new Date,
                    data: callbackData
                });
            }
            this.system('Svg sprite successfully generated!');
        } catch(e) {
            console.log(e);
        }
        return callbackData;
    }
    async begin() {
        try {
            await this.renderMaster.run();
        } catch(e) {
            console.log(e);
        }
        let status = this.renderMaster.status();
        if(status.clean) {
            this.emit('rendered', true);
            if(!this.begined) {
                this.begined = true;
                this.emit('begined', this.iconsStorage);
            }
        }
    }
}

module.exports = iconsPlugin;