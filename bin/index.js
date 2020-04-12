let fse = require('fs-extra');
let fs = require('fs');
let fastify = require('fastify');
let path = require('path');
let colors = require('colors');
const ioSockets = require('socket.io');
const handler = require('serve-handler');
const { promisify } = require("util");
const prompts = require('prompts');
const _ = require('underscore');
const ungicProject = require('./project');
const fsp = fs.promises;
fsp.exists = promisify(fs.exists);
const skeleton = require('./modules/skeleton');
const appPaths = require('./modules/app-paths')();
const open = require('open');

class app extends skeleton {
    constructor(args={}) {
        let config_cmd = {
            server: {
                port: args.port
            },
            mode: args.mode,
            verbose: args.verbose,
            openInBrowser: args.open
        }
        let config = {
            plugins: {
                "scss": {},
                "html": {},
                "icons": {}
            }
        }
        let configPath = appPaths.config;
        let packagePath = appPaths.package;
        if(packagePath) {
            let packageData = require(packagePath);
            config.name = packageData.name;
            config.version = packageData.version;
            config.author = packageData.author;
            if(typeof packageData.browserslist == 'object') {
                if(packageData.browserslist[args.mode]) {
                    process.env.browserslist = packageData.browserslist[args.mode];
                }
            }
            if(typeof packageData.postcss_clean == 'object') {
                process.env.postcss_clean = packageData.postcss_clean;
            } else {
                process.env.postcss_clean = {}
            }
        }
        if(configPath) {
            config = Object.assign(config, require(configPath), config_cmd);
        } else {
            config = Object.assign(config, config_cmd);
        }

        super(require('./model-scheme'), {objectMerge: true}, config);
        config = this.config;
        process.env.NODE_ENV = config.mode;
        this.sockets = new Map;
        this.project = {};
        this.socketsArgs = [];
    }
    async initialize() {
        if(!appPaths.config && !appPaths.package) {
            this.log('Note! Recommended to create package.json using npm init command.', 'warning');
            let response = await prompts({
                type: 'confirm',
                name: 'next',
                message: 'You want to continue without installation npm package.json?'
            });
            if(!response.next) {
                this.log('Please initialize npm first', 'Note');
                return process.exit();
            }
            response = await prompts([
                {
                    type: 'text',
                    name: 'name',
                    message: 'project name',
                    initial: path.basename(appPaths.root).replace(/\s+/, '_')
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
            this.setConfig(response);
            await fse.outputFile(path.join(appPaths.root, 'ungic.config.json'), JSON.stringify(this.config, null, 4));
        }

        let prj = new ungicProject(this.config);
        try {
            await prj.initialize();
        } catch(e) {
            this.log(e);
            return
        }
        this.log('Project successfully initialized. Use "ungic run" command for starting', 'Note');
        process.exit();
    }
    async begin() {
        if(!appPaths.config && !appPaths.package) {
            this.error('This directory is not an ungic project. To get started use <ungic --help> command.', {exit: true});
            return;
        }
        let config = this.config;
        this.fastify = fastify({ logger: false, ignoreTrailingSlash: false});
        let io = ioSockets(this.fastify.server);
        this.fastify.decorate('io', io);
        this.fastify.decorate('app', this);
        this.fastify.register(require('fastify-static'), {
            root:  path.join(__dirname, 'client'),
            prefix: '/ungic/',
            redirect: true,
            setHeaders: (res) => {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.setHeader('Surrogate-Control', 'no-store');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
        });

        await require('./api')(this.fastify, this);

        this.fastify.use((req, res, next) => {
            if(req.originalUrl != 'ungic' && !/^\/ungic\//.test(req.originalUrl)) {
                return handler(req, res, {
                    public: path.join(appPaths.root, config.fs.dirs.dist),
                    headers: [{
                      "source" : "**/*",
                      "headers" : [
                          {
                            "key" : "Cache-Control",
                            "value" : "no-store, no-cache, must-revalidate, proxy-revalidate"
                          },
                          {
                            "key" : "Surrogate-Control",
                            "value" : "no-store",
                          },
                          {
                            "key" : "Pragma",
                            "value" : "no-cache"
                          },
                          {
                            "key" : "Expires",
                            "value" : "0"
                          }
                      ]
                    }]
                });
            } else {
                next();
            }
        });
        let start = async port => {
            try {
                this.fastify.address = await this.fastify.listen(port);
            } catch(err) {
                this.log(err.message);
                await start(port+1);
            }
        }
        await start(config.server.port);

        io.on('connection', socket => {
            this.sockets.set(socket.id, socket);
            socket.on('disconnect', () => {
                this.sockets.delete(socket.id);
            });
        });
        let port = this.fastify.server.address().port;
        this.setConfig({port: port});
        this.log(`Server is listening on ${this.fastify.address}`);
        this.project = new ungicProject(this.config);
        this.project.on('log', (type, message, args={}) => {
            this.log(message, type, args);
        });

        this.project.on('watcher:' + config.fs.dirs.dist, (event, ph) => {
            let relative = path.relative(this.project.dist, ph).replace(/\\+/g, '/');
            io.emit('change', event, this.fastify.address + '/' + path.relative(this.project.dist, ph).replace(/\\+/g, '/'), relative);
        });

        try {
            await this.project.begin({fastify: this.fastify});
        } catch(e) {
            console.log(e);
        }
        if(config.openInBrowser) {
            await open(this.fastify.address);
        }
    }
}
module.exports = app;