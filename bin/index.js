let fse = require('fs-extra');
let fs = require('fs');
let fastify = require('fastify');
let path = require('path');
const ioSockets = require('socket.io');
const handler = require('serve-handler');
const { promisify } = require("util");
const prompts = require('prompts');
const _ = require('underscore');
const ungicProject = require('./project');
const fsp = fs.promises;
fsp.exists = promisify(fs.exists);
const skeleton = require('./modules/skeleton');
const open = require('open');
const Collector = require('./modules/collector.js');
const merge = require('deepmerge');
let URL = require('url');
const fg = require('fast-glob');

class finishController extends skeleton {
    constructor(config = {}) {
        super({}, { objectMerge: true }, config);
        this.collector = new Collector({ timeout: 100 });
        this.collector.on('finish', events => {
            if (this.parent.fastify.io) {
                this.parent.fastify.io.emit('change', events);
            }
        });
        this.tasks = new Set;
    }
    push(event) {
        this.collector.add(event);
    }
    task(id) {
        this.collector.pause();
        this.tasks.add(id);
    }
    releaseTask(id) {
        this.tasks.delete(id);
        if (!this.tasks.size) {
            this.collector.run();
        }
    }
}
let appPaths;
class app extends skeleton {
    constructor(args = {}) {
        let config_cmd = {
            server: {},
            mode: args.mode,
            verbose: args.verbose,
            openInBrowser: args.open
        }
        if (args.port) {
            config_cmd.server.port = args.port;
        }
        let config = {
            plugins: {
                "scss": {},
                "html": {},
                "icons": {}
            }
        }
        appPaths = require('./modules/app-paths')(args.command == 'init');

        let configPath = appPaths.config;
        let packagePath = appPaths.package;
        let PLUGINS_SETTINGS = {};

        let introPluginsSettings = (key, env) => {
            let getConfig = (ph) => {
                if (!ph) {
                    return {}
                }
                try {
                    let data = fs.readFileSync(ph, 'UTF-8');
                    data = JSON.parse(data);
                    return data;
                } catch (e) {

                }
                return {}
            }
            let configs = [getConfig(packagePath), getConfig(configPath)];

            if (!PLUGINS_SETTINGS[key]) {
                PLUGINS_SETTINGS[key] = {}
            }
            for (let config of configs) {
                if (typeof config[key] == 'object') {
                    if (config[key][args.mode]) {
                        PLUGINS_SETTINGS[key] = config[key][args.mode];
                        if (env && config[key][args.mode].length != undefined) {
                            process.env[env] = config[key][args.mode];
                        }
                    }
                }
            }
        }
        if (packagePath) {
            let packageData = require(packagePath);
            config.name = packageData.name;
            config.version = packageData.version;
            config.author = packageData.author;
        }

        introPluginsSettings('browserslist', 'BROWSERSLIST');
        introPluginsSettings('cleancss');
        introPluginsSettings('htmlminifier');
        introPluginsSettings('cheerio');
        introPluginsSettings('beautify');

        if (configPath) {
            let appConfig = require(configPath);
            let server = Object.assign(appConfig.server, config_cmd.server);
            config_cmd.server = server;
            config = Object.assign(config, appConfig, config_cmd);

        } else {
            config = Object.assign(config, config_cmd);
        }



        super(require('./model-scheme'), { objectMerge: true }, config);
        this.PLUGINS_SETTINGS = PLUGINS_SETTINGS;
        config = this.config;
        process.env.NODE_ENV = config.mode;
        this.sockets = new Map;
        this.project = {};
        this.socketsArgs = [];
        this.finishController = new finishController;
        this.finishController.parent = this;
    }
    async createApp(name) {
        let ph = path.join(appPaths.cwd, name);
        let dirExist = await fsp.exists(ph);

        if (dirExist && fs.readdirSync(ph).length) {
            this.system(ph + ' directory already exists and is not empty', 'error');
            return process.exit();
        }
        return this.initialize({
            root: ph,
            name: path.basename(ph),
            createMode: true
        });
    }
    async initialize(options = {}) {
        if (appPaths.config) {
            if (options.createMode) {
                this.system('You cannot create a new project inside an existing ungic project!', 'warning');
            } else {
                this.system('Project successfully initialized. Use "ungic run" command for starting', 'warning');
            }
            return process.exit();
        }

        let response;
        if (!appPaths.config && !appPaths.package && !options.createMode) {
            this.system('Note! Recommended to create package.json using npm init command.', 'warning');
            response = await prompts({
                type: 'confirm',
                name: 'next',
                message: 'Do you want to continue without installation npm package.json?',
                initial: true
            });
            if (!response.next) {
                this.system('Please initialize npm first', 'Note');
                return process.exit();
            }
        }
        if (options.createMode) {
            response = await prompts([
                {
                    type: 'text',
                    name: 'name',
                    message: 'project name',
                    initial: options.name ? options.name : path.basename(appPaths.root).replace(/\s+/, '_')
                },
                {
                    type: 'text',
                    name: 'version',
                    message: 'version',
                    initial: '1.0.0'
                }, {
                    type: 'text',
                    name: 'author',
                    message: 'author',
                    initial: process.env.USERNAME
                }
            ]);

            if (!response || typeof response == 'object' && !Object.keys(response).length) {
                this.system('The action was canceled', 'warning');
                return process.exit();
            }
            this.setConfig(response);
        }

        if (options.createMode) {
            await fse.emptyDir(options.root);
        }
        options.app = this;
        let prj = new ungicProject(this.config, options);
        try {
            let config = await prj.initialize({ checkDirs: true });
            if (config instanceof Error) {
                this.system(config);
                process.exit();
            }
            await fse.outputFile(path.join(options.root ? options.root : appPaths.root, 'ungic.config.json'), JSON.stringify(merge(this.config, config, { arrayMerge: (destinationArray, sourceArray) => _.union(destinationArray, sourceArray) }), null, 4));
        } catch (e) {
            this.system(e);
            return
        }
        if (options.createMode) {
            this.system('Project successfully initialized. To run the project, go to the created ' + response.name + ' directory and use the "ungic run" command!', 'success');
        } else {
            this.system('Project successfully initialized. To run the project, use the "ungic run" command!', 'success');
        }
        process.exit();
    }
    async suitableAppDir() {
        let dirs = await fg('**', { cwd: appPaths.root, dot: false, onlyDirectories: true, deep: 1 });
        return !dirs.length
    }
    async begin(opt = {}) {
        let release = opt.release;
        if (!appPaths.config && !appPaths.package) {
            if (await this.suitableAppDir()) {
                this.system('First initialize a new project with <ungic init> command before running it', 'warning', { exit: true });
            } else {
                this.system('This directory is not an ungic project. To get started use <ungic --help> command.', 'error', { exit: true });
            }
            return;
        }
        let config = this.config;
        this.fastify = fastify({
            logger: false,
            ignoreTrailingSlash: false
        });
        this.fastify.decorate('uid', () => '_' + Math.random().toString(36).substr(2, 9));
        this.fastify.decorate('app', this);

        if (!release) {
            let io = ioSockets(this.fastify.server);
            this.fastify.decorate('io', io);
            this.fastify.register(require('fastify-static'), {
                root: path.join(__dirname, 'client'),
                prefix: '/ungic/',
                redirect: true,
                decorateReply: false,
                setHeaders: (res) => {
                    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                    res.setHeader('Surrogate-Control', 'no-store');
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Expires', '0');
                }
            });
            this.fastify.register(require('fastify-static'), {
                root: path.join(appPaths.root, config.fs.dirs.source, config.fs.source.assets),
                prefix: '/assets/',
                decorateReply: true,
                setHeaders: (res) => {
                    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                    res.setHeader('Surrogate-Control', 'no-store');
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Expires', '0');
                }
            });

            await require('./api')(this.fastify, this);

            this.fastify.use((req, res, next) => {
                if (req.originalUrl != 'ungic' && !/^\/ungic\//.test(req.originalUrl) && !/^\/assets\//.test(req.originalUrl)) {

                    let parsed = URL.parse(req.url);
                    let reqUrl = parsed.pathname;
                    let pathToFile = path.join(appPaths.root, config.fs.dirs.dist, reqUrl);

                    let assetsFile = path.join(appPaths.root, config.fs.dirs.source, config.fs.source.assets, reqUrl);

                    if (!fs.existsSync(pathToFile) && fs.existsSync(assetsFile)) {
                        req.url = '/assets/' + req.url.replace(/^\/+/, '');
                        req.originalUrl = '/assets/' + req.url.replace(/^\/+/, '');
                    } else {
                        return handler(req, res, {
                            public: path.join(appPaths.root, config.fs.dirs.dist),
                            renderSingle: true,
                            symlinks: true,
                            headers: [{
                                "source": "**/*",
                                "headers": [
                                    {
                                        "key": "Cache-Control",
                                        "value": "no-store, no-cache, must-revalidate, proxy-revalidate"
                                    },
                                    {
                                        "key": "Access-Control-Allow-Origin",
                                        "value": "*"
                                    },
                                    {
                                        "key": "Surrogate-Control",
                                        "value": "no-store",
                                    },
                                    {
                                        "key": "Pragma",
                                        "value": "no-cache"
                                    },
                                    {
                                        "key": "Expires",
                                        "value": "0"
                                    }
                                ]
                            }]
                        });
                    }
                }
                if (/^\/assets\//.test(req.originalUrl)) {
                    req.originalUrl = req.originalUrl.replace(/^\/assets\//, '');
                    req.url = req.url.replace(/^\/assets\//, '');
                    return handler(req, res, {
                        public: path.join(appPaths.root, config.fs.dirs.source, config.fs.source.assets),
                        trailingSlash: true,
                        headers: [{
                            "source": "**/*",
                            "headers": [
                                {
                                    "key": "Cache-Control",
                                    "value": "no-store, no-cache, must-revalidate, proxy-revalidate"
                                },
                                {
                                    "key": "Access-Control-Allow-Origin",
                                    "value": "*"
                                },
                                {
                                    "key": "Surrogate-Control",
                                    "value": "no-store",
                                },
                                {
                                    "key": "Pragma",
                                    "value": "no-cache"
                                },
                                {
                                    "key": "Expires",
                                    "value": "0"
                                }
                            ]
                        }]
                    });
                } else {
                    next();
                }
            });


            this.serverPort = config.server.port;
            await new Promise(done => {
                let start = async () => {
                    await this.fastify.listen({
                        port: this.serverPort,
                        host: '127.0.0.1',
                        exclusive: false,
                        readableAll: false,
                        writableAll: false,
                        ipv6Only: false
                    }).then(address => {
                        this.fastify.address = address;
                        done(address);
                    }).catch(() => {
                        this.serverPort = this.serverPort + 1;
                        start();
                    });
                }
                start();
            });

            io.on('connection', socket => {
                this.sockets.set(socket.id, socket);
                socket.on('disconnect', () => {
                    this.sockets.delete(socket.id);
                });
            });
            let port = this.fastify.server.address().port;


            let serverConfig = config.server;

            serverConfig.port = port;
            serverConfig.address = this.fastify.address;

            this.setConfig({ server: serverConfig });
        }

        this.project = new ungicProject(this.config, { app: this });
        this.project.on('log', (type, message, args = {}) => {
            this.log(message, type, args);
        });
        this.project.on('icons', async e => {
            this.finishController.push({
                event: 'iconsReload',
                data: e
            });
        });
        if (!release) {
            this.project.on('watcher', (event, rp, ph) => {
                rp = path.normalize(rp).replace(/^[\\\/]+/, '');

                let needPath = path.normalize(path.join(config.fs.dirs.source, config.fs.source.assets).replace(/^[\\\/]+/, ''));
                //console.log(rp, ph);
                if (rp.indexOf(needPath) !== 0) {
                    return
                }
                let relative = path.relative(this.project.assets, ph).replace(/\\+/g, '/');
                this.finishController.push({
                    event,
                    url: this.fastify.address + '/' + relative,
                    relative
                });
            });
            this.project.on('watcher', (event, rp, ph) => {
                let relative = path.relative(this.project.dist, ph).replace(/\\+/g, '/');
                //console.log(rp, ph);
                if (path.normalize(rp).replace(/^[\\\/]+/, '').indexOf(path.normalize(config.fs.dirs.dist).replace(/^[\\\/]+/, '')) !== 0) {
                    return
                }
                this.finishController.push({
                    event,
                    url: this.fastify.address + '/' + path.relative(this.project.dist, ph).replace(/\\+/g, '/'),
                    relative
                });
            });
        }
        this.project.on('icons', icons => {
            this.finishController.push({
                icons,
                event: 'icons',
                relative: 'ungic-icons.html'
            });
        });
        this.project.on('plug_render', id => {
            this.finishController.task(id);
        });
        this.project.on('plug_rendered', id => {
            //console.log('plug_rendered');
            this.finishController.releaseTask(id);
        });

        try {
            await this.project.initialize({ run: true });
            await this.project.begin({ fastify: this.fastify });
        } catch (e) {
            console.log(e);
        }
        let htmlPlugin = this.project.plugins.get('html');

        let pages = await fg('**/*.html', { cwd: htmlPlugin.root, deep: 10, dot: false });

        if (config.openInBrowser && pages.length && !release) {
            await open(this.fastify.address);
        }
        process.title = `[${config.name}] ungic project`;
    }
}
module.exports = app;