#!/usr/bin/env node
let colors = require('colors');
let path = require("path");
let ungic = require("./bin");
let skeleton = require('./bin/modules/skeleton');
let readline = require('./bin/modules/readline');
const fg = require('fast-glob');

class App extends skeleton {
    constructor() {
        super({},{}, {
            command: ""
        });
        let yargs = require('yargs')
            .option('verbose', {
                alias: 'v',
                type: 'boolean',
                description: 'Run with verbose logging',
                default: false
            })
            .option('log', {
                alias: 'l',
                type: 'boolean',
                description: 'Enable log output to console',
                default: true
            })
            .option('mode', {
                alias: 'm',
                type: 'string',
                description: 'Providing the mode configuration. Manipulates NODE_ENV environment variable.',
                default: 'development'
            })
            .command('init', "Initializes a project for the first time", args => {
                this.setConfig({
                    command: 'init'
                });
            })
            .command('run', "Launches ungic project", yargs => {
                return yargs
                .option('open', {
                    alias: 'o',
                    type: 'boolean',
                    description: 'Open start page in browser',
                    default: true
                })
                .option('port', {
                    alias: 'p',
                    type: 'number',
                    description: 'Port number to start the server',
                    default: 2020
                })
            }, args => {
                this.setConfig({
                    command: 'run'
                });
            });

        let argv = yargs.argv;
        this.setConfig(argv);
    }
    async initialize() {
        let config = this.config;
        if(['init', 'run'].indexOf(config.command) == -1) {
            console.log(colors.yellow.bold('To get started with ungic, you need to follow these simple steps:'));
            console.log(colors.yellow('● Select a previously prepared directory or new empty directory'));
            console.log(colors.yellow('● Initialize a new project using <ungic init> command'));
            console.log(colors.yellow('● Run with <ungic run> command'));
            require('yargs').showHelp();
            return;
        }

        this.app = new ungic(config);
        if(config.log) {
            console.log(colors.cyan('Log output to console enabled. You can disable this option using the "log 0" command.'));
        } else {
            console.log(colors.cyan('Log output to console disabled. You can enable this option using the "log 1" command.'));
        }
        this.app.on('log', (type, message, args={}) => {
            if(!config.log && type != 'error') {
                return;
            }
            if(type == 'error') {
                type = colors.red.bold(type);
            }
            if(type == 'warning') {
                type = colors.yellow.bold(type);
            }
            if(args.plugin_id) {
                console.log(`${type}::[${args.plugin_id}]:${message}`);
            } else {
                console.log(`${type}::${message}`);
            }
            if(args.exit) {
                process.exit(0);
            }
            if(this.rl) {
                this.rl.done();
            }
        });
        this.on('log', (type, message) => {
            if(!config.log) {
                return;
            }
            if(type == 'error') {
                type = colors.red.bold(type);
            }
            if(type == 'warning') {
                type = colors.yellow.bold(type);
            }
            console.log(`${type}::${message}`);
            if(this.rl) {
                this.rl.done();
            }
        });
        if(config.command == 'init') {
            await this.app.initialize();
        }
        if(config.command == 'run') {
            await this.app.begin();
        }
        let self = this;
        let appMenu = function(yargs, done) {
            yargs
                .command('log <status>', 'Log output to the console', args => {
                    args.positional('status', {
                        describe: 'Enable or disable log output to console',
                        type: 'boolean'
                    });
                }, args => {
                    let log = args.status;
                    if(log != config.log) {
                        config.log = log;
                        if(log) {
                            console.log(colors.cyan('Log output to the console is activated'));
                        } else {
                            console.log(colors.cyan('Log output to the console is deactivated'));
                        }
                    }
                });
                let cliModes = fg.sync('./bin/cli/*.js', {cwd: __dirname});
                if(cliModes.length) {
                    for(let handler of cliModes) {
                        let name = path.basename(handler, path.extname(handler));
                        yargs
                            .command(name, `switch to ${name} menu`, {}, () => {
                                this.rl.close();
                                self.rl = new readline(function(yargs, done) {
                                    let handlerFunc = require(handler);
                                    handlerFunc.call(self, yargs, (message, type)=>{
                                        if(message) {
                                            self.log(message, type);
                                        }
                                        done();
                                    });
                                }, name, () => {
                                    self.rl = new readline(appMenu);
                                });
                            })
                    }
                }

            yargs
                .argv;
        }

        this.rl = new readline(appMenu);
    }
}

(async() => {
    let app = new App;
    await app.initialize();
})();