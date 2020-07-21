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
let appPaths;
class ungicProject extends skeleton {
    constructor(config) {
        super({}, {}, config);
        appPaths = require('../modules/app-paths')();
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

        scssPlugin = new scssPlugin(Object.assign(config.plugins.scss || {}, {
            fs: config.fs
        }), {project: this});

        scssPlugin.on('log', (type, message, args) => {
            this.log(message, type, args);
        });

        let uid = this.fastify.uid();
        scssPlugin.on('render', () => {
            renderInterceptor(scssPlugin);
        });

        this.plugins.set(scssPlugin.id, scssPlugin);
        iconsPlugin = new iconsPlugin(Object.assign(config.plugins.icons || {}, {
            fs: config.fs
        }), {project: this});

        uid = this.fastify.uid();
        iconsPlugin.on('render', () => {
            renderInterceptor(iconsPlugin);
        });
        /*scssPlugin.on('render', ()=>{
            this.emit('render');
        })*/

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
            let findDir = (fs, name) => {
                if(fs.dirs) {
                    for(let dir in fs.dirs) {
                        let dirLabel = fs.dirs[dir];
                        if(dirLabel == name) {
                            return config.fs[dir];
                        }
                    }
                } else {
                   return fs[name];
                }
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

            let watchEvent = (storage, dir, prev="", prevdir="") => {
                let _dir = findDir(storage, dir);
                if(_dir) {
                    this._events.emit('watcher:' + prev + dir, event, ph, stat);
                    if(this.plugins.size) {
                        this.plugins.forEach(plugin=>plugin.emit('watcher:' + prev + dir, event, ph, stat));
                    }
                    watchEvent(_dir, ph_splitter.shift(), prev + dir + ':', dir);
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