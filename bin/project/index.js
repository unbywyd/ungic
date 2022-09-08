const path = require('path');
const _ = require('underscore');
const chokidar = require('chokidar');
const fs = require('fs');
const fsp = fs.promises;
const fse = require('fs-extra');
const { promisify } = require("util");
fsp.exists = promisify(fs.exists);
let scssPlugin = require('../plugins/scss');
let htmlPlugin = require('../plugins/html');
let iconsPlugin = require('../plugins/icons');
let skeleton = require('../modules/skeleton');
const merge = require('deepmerge');
let appPaths;
class builder extends skeleton {
    constructor(scheme, config={}) {
        super(scheme, {objectMerge: true}, config);
    }
}
class ungicProject extends skeleton {
    constructor(config, options={}) {
        super({}, {}, config);
        appPaths = require('../modules/app-paths')();
        this.root = options.root ? options.root : appPaths.root;
        this.app = options.app;
        config = this.config;
        this.dist = path.join(this.root, config.fs.dirs.dist);
        this.assets = path.join(path.join(this.root, config.fs.dirs.source), config.fs.source.assets);
        this.sourceDir = path.join(this.root, config.fs.dirs.source);
        this.plugins = new Map;
        this.skipWatch = new Set;
    }
    async initialize(options={}) {
        let config = this.config;
        let checkDirsOnly = (root, dirs) => {
            let status = true;
            return () => {
                for(let dir in dirs) {
                    let toPath = path.join(root, dirs[dir]);
                    if(fs.existsSync(toPath)) {       
                        return new Error('Conflict occurred during initialization. ' + toPath + ' already exists.');                 
                    }
                    if(config.fs[dir]) {
                        checkDirsOnly(toPath, config.fs[dir]);
                    }
                }
                return status;
            }
        }
        let ensureDirs = async (root, dirs) => {
            for(let dir in dirs) {
                let toPath = path.join(root, dirs[dir]);
                if(!await fsp.exists(toPath)) {
                    await fse.ensureDir(toPath);
                }
                if(config.fs[dir]) {
                    await ensureDirs(toPath, config.fs[dir]);
                }
            }
        }
        if(options.checkDirs) {
            let getStatus = checkDirsOnly(this.root, this.fsDirs());
            let status = getStatus();
            if(status === true) {
                await ensureDirs(this.root, this.fsDirs());
            }
        } else {
            await ensureDirs(this.root, this.fsDirs());
        }
        

        if(!options.run) {
            let buildPlugins = {
                html: {},
                scss: {},
                icons: {}
            }
            let configPlugins = {
                html: {},
                scss: {},
                icons: {}
            }
            for(let plugin in buildPlugins) {
                let buildSchemePath = path.join('../plugins/' + plugin, './build.model-scheme');
                let configSchemePath = path.join('../plugins/' + plugin, './model-scheme');
                let Config = new builder(require(configSchemePath), config.plugins[plugin]);
                configPlugins[plugin] = _.omit(Config.config, 'fs', 'render', 'id');
                let Builder = new builder(require(buildSchemePath));
                buildPlugins[plugin] = Builder.config;
            }

            return {
                build: {
                    plugins: buildPlugins
                },
                plugins: configPlugins
            }
        }
    }
    async updateConfigFile(data={}) {
        try {
            let currentConfig = await fsp.readFile(path.join(this.root, 'ungic.config.json'), 'UTF-8');
            currentConfig = JSON.parse(currentConfig);
            if(typeof data == 'function') {
                currentConfig = data(currentConfig);
            } else {
                currentConfig = _.extend(currentConfig, data);
            }
            await fse.outputFile(path.join(this.root, 'ungic.config.json'), JSON.stringify(currentConfig, false, 4));
        } catch(e) {
            this.system('ungic.config.json incorrect', 'error');
        }
    }
    async updateConfig() {        
        try {
            let currentConfig = await fsp.readFile(path.join(this.root, 'ungic.config.json'), 'UTF-8');
            currentConfig = JSON.parse(currentConfig);
            this.setConfig(merge(this.config, currentConfig, {
                arrayMerge: (destinationArray, sourceArray) => _.union(destinationArray, sourceArray)
            }));
        } catch(e) {
            this.system('ungic.config.json incorrect', 'error');
        }
    }
    async begin(options={}) {
        let config = this.config;
        this.fastify = options.fastify;

        let htmlPluginConfig = _.extend({}, config.plugins.html || {}, {fs: config.fs});
        htmlPlugin = new htmlPlugin(htmlPluginConfig, {
            project: this
        });

        htmlPlugin.on('log', (type, message, args) => {
            this.log(message, type, args);
        });

        let self = this;
        let renderInterceptor = function(plugin) {
            let uid = self.fastify.uid();
            self.emit('plug_render', uid);
            let destroy = function() {
                self.emit('plug_rendered', uid);
                plugin.off('rendered', destroy);
            }
            plugin.on('rendered', destroy);
        }
        htmlPlugin.on('render', () => {         
            renderInterceptor(htmlPlugin);
        });

        this.plugins.set(htmlPlugin.id, htmlPlugin);

        let scssPluginConfig = _.extend({}, config.plugins.scss || {}, {fs: config.fs});
        scssPlugin = new scssPlugin(scssPluginConfig, {project: this});

        scssPlugin.on('log', (type, message, args) => {
            this.log(message, type, args);
        });

        let uid = this.fastify.uid();
        scssPlugin.on('render', () => {
            renderInterceptor(scssPlugin);
        });

        this.plugins.set(scssPlugin.id, scssPlugin);
        let iconsPluginConfig = _.extend({}, config.plugins.icons || {}, {fs: config.fs});
        iconsPlugin = new iconsPlugin(iconsPluginConfig, {project: this});

        uid = this.fastify.uid();
        iconsPlugin.on('render', () => {
            renderInterceptor(iconsPlugin);
        });

        iconsPlugin.on('log', (type, message, args) => {
            this.log(message, type, args);
        });

        iconsPlugin.on('icons', icons => {
            this.emit('icons', icons);
        });
        this.plugins.set(iconsPlugin.id, iconsPlugin);

        let processes = [];
        try {
            processes.push();
            await iconsPlugin.initialize();
            await htmlPlugin.initialize();
            await scssPlugin.initialize();

            if(!this.begined) {
                processes.push(new Promise((res, rej) => {
                    function cb() {
                        htmlPlugin.off('rendered', cb);
                        res();
                    }
                    htmlPlugin.on('rendered', cb);
                }));
                processes.push(new Promise((res, rej) => {
                    function cb() {
                        scssPlugin.off('rendered', cb);
                        res();
                    }
                    scssPlugin.on('rendered', cb);
                }));
                processes.push(new Promise((res, rej) => {
                    function cb() {
                        iconsPlugin.off('rendered', cb);
                        res();
                    }
                    iconsPlugin.on('rendered', cb);
                }));
            }

            processes.push(new Promise((res, rej) => {
                iconsPlugin.on('begined', async(icons) => {
                    try {
                        let toHTML = async () => {
                            scssPlugin.off("rendered", toHTML);
                            await htmlPlugin.begin({icons});
                            res();
                        } 
                        scssPlugin.on("rendered", toHTML);
                        await scssPlugin.begin({icons});                                                              
                    } catch(e) {
                        console.log(e);
                    }                    
                });
            }));
            processes.push(iconsPlugin.begin());
            await Promise.all(processes);
        } catch(e) {
            console.log(e);
            this.error(e);
        }     
        this.createWatcher({
            ignoreInitial: true
        });  
        this.begined = true;
    }
    createWatcher(cfg) {
        this.watcher = chokidar.watch(this.root, Object.assign({                        
                ignorePermissionErrors: true,
                ignored: (ph) => ph.includes('node_modules') || ph.includes('.git') || path.extname(ph).toLowerCase() == '.tmp',
                awaitWriteFinish: {
                    stabilityThreshold: 100,
                },
            }, cfg)).on('all', (event, ph, stat) => {         
            if(event == 'change' && path.join(this.root, 'ungic.config.json') == ph) {
                this.updateConfig();
            }
            let paths = [...this.skipWatch.values()];
            if(paths.length) {
                for(let p of paths) {
                    if(path.normalize(ph).split(path.normalize(p)).length > 1) {
                        return
                    }
                }
            }
            let ph_splitter = _.filter(ph.split(this.root)[1].split(path.sep), ph => ph != "");
            let watchEvent = (relativePath) => {              
                this._events.emit('watcher', event, relativePath, ph, stat);
                if(this.plugins.size) {
                    this.plugins.forEach(plugin=>plugin.emit('watcher', event, relativePath, ph, stat));
                }
            }
          
            let relativePath = path.relative(this.root, ph);            
            if(ph_splitter.length > 1) {
                watchEvent(relativePath);
            } else {
                this._events.emit('watcher:root', event, ph, stat);
            }
        });
        return this.watcher;
    }
    unwatch(plugin) {
        this.skipWatch.add(plugin.root);
    }
    watch(plugin) {
        this.skipWatch.delete(plugin.root);
    }
    destroy() {
        return this.watcher.close();
    }
    fsDirs(dirname) {
        let config = this.config;
        if(!dirname) {
            return config.fs.dirs;
        }
        if(dirname in config.fs.dirs) {
            return config.fs.dirs[dirname];
        }
    }
    fsDist(dirname) {
        let config = this.config;
        if(!dirname) {
            return config.fs.dist;
        }
        if(dirname in config.fs.dist) {
            return config.fs.dist[dirname];
        }
    }
    fsSource(dirname) {
        let config = this.config;
        if(!dirname) {
            return config.fs.source;
        }
        if(dirname in config.fs.source) {
            return config.fs.source[dirname];
        }
    }
}


module.exports = ungicProject;