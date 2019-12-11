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
let skeleton = require('../modules/skeleton');
const appPaths = require('../modules/app-paths')();
class ungicProject extends skeleton {
    constructor(config) {
        super({}, {}, config);
        this.root = appPaths.root;
        this.plugins = new Map;
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

        htmlPlugin = new htmlPlugin(Object.assign(config.plugins.html, {
            fs: config.fs
        }), {project: this});

        htmlPlugin.on('log', (type, message, args) => {
            this.log(message, type, args);
        });
        this.plugins.set(htmlPlugin.id, htmlPlugin);

        scssPlugin = new scssPlugin(Object.assign(config.plugins.scss, {
            fs: config.fs
        }), {project: this});

        scssPlugin.on('log', (type, message, args) => {
            this.log(message, type, args);
        });

        this.plugins.set(scssPlugin.id, scssPlugin);

        let processes = [];
        try {
            processes.push();
            await htmlPlugin.initialize();
            await scssPlugin.initialize();

            processes.push(new Promise((res, rej) => {
                scssPlugin.on('begined', async() => {
                    await htmlPlugin.begin();
                    res();
                });
            }));
            await scssPlugin.begin();
            await Promise.all(processes);
        } catch(e) {
            this.error(e);
        }

        this.watcher = chokidar.watch(this.root, {
            ignoreInitial: true,
            ignorePermissionErrors: true,
            ignored: ['*.TMP', '*.tmp']
        }).on('all', (event, ph, stat) => {
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