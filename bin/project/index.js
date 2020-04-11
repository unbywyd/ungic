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
const appPaths = require('../modules/app-paths')();
class ungicProject extends skeleton {
    constructor(config) {
        super({}, {}, config);
        this.root = appPaths.root;
        config = this.config;
        this.dist = path.join(this.root, config.fs.dirs.dist);
        this.plugins = new Map;
        this.skipWatch = new Set;
    }
    async initialize() {
        let config = this.config;
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
        await ensureDirs(this.root, this.fsDirs());
    }
    async begin(options={}) {
        let config = this.config;
        this.fastify = options.fastify;

        htmlPlugin = new htmlPlugin(Object.assign(config.plugins.html || {}, {
            fs: config.fs
        }), {
            project: this
        });


        htmlPlugin.on('log', (type, message, args) => {
            this.log(message, type, args);
        });

        this.plugins.set(htmlPlugin.id, htmlPlugin);

        scssPlugin = new scssPlugin(Object.assign(config.plugins.scss || {}, {
            fs: config.fs
        }), {project: this});

        scssPlugin.on('log', (type, message, args) => {
            this.log(message, type, args);
        });

        this.plugins.set(scssPlugin.id, scssPlugin);
        iconsPlugin = new iconsPlugin(Object.assign(config.plugins.icons || {}, {
            fs: config.fs
        }), {project: this});

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
            processes.push(new Promise((res, rej) => {
                iconsPlugin.on('begined', async(icons) => {
                    try {
                        await scssPlugin.begin({icons});
                        await htmlPlugin.begin({icons});
                    } catch(e) {
                        console.log(e);
                    }
                    res();
                });
            }));
            processes.push(iconsPlugin.begin());
            await Promise.all(processes);
        } catch(e) {
            console.log(e);
            this.error(e);
        }

        this.watcher = chokidar.watch(this.root, {
            ignoreInitial: true,
            ignorePermissionErrors: true,
            ignored: ['*.TMP', '*.tmp'],
            awaitWriteFinish: {
                stabilityThreshold: 50
            },
        }).on('all', (event, ph, stat) => {
            let paths = [...this.skipWatch.values()];
            //console.log('ignore', paths);
            //console.log('active ph', ph);
            if(paths.length) {
                for(let p of paths) {
                    if(path.normalize(ph).split(path.normalize(p)).length > 1) {
                        console.log('Ignored');
                        return
                    }
                }
            }
            let ph_splitter = _.filter(ph.split(this.root)[1].split(path.sep), ph => ph != "");
            let watchEvent = (storage, dir, prev="", prevdir="") => {
                if(storage[dir]) {
                    this._events.emit('watcher:' + prev + dir, event, ph, stat);
                    if(this.plugins.size) {
                        this.plugins.forEach(plugin=>plugin.emit('watcher:' + prev + dir, event, ph, stat));
                    }
                    watchEvent(storage[dir], ph_splitter.shift(), prev + dir + ':', dir);
                }
            }
            if(ph_splitter.length > 1) {
                watchEvent(config.fs, ph_splitter.shift());
            } else {
                this._events.emit('watcher:root', event, ph, stat);
            }
        });
        this.begined = true;
    }
    unwatch(plugin) {
        this.skipWatch.add(plugin.root);
    }
    watch(plugin) {
        this.skipWatch.delete(plugin.root);
    }
    destroy() {
        this.watcher.close();
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