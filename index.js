#!/usr/bin/env node
let colors = require('colors');
let path = require("path");
let ungic = require("./bin");
let skeleton = require('./bin/modules/skeleton');
let readline = require('./bin/modules/readline');
const fg = require('fast-glob');
const { clear } = require('console');

let logger = function (options) {
  this.options = options;
  this.storage = new Map();
  //this.timers = new Map;
}
logger.prototype.decorate = function (message, label, color) {
  let strArray = message.split('\n');
  strArray = strArray.map(el => colors[color].bold('| ') + el);
  let closeLines = '';
  for (let i = 0; i < ((8 * 2) + label.length); i++) {
    closeLines += '-';
  }
  let output = colors[color].bold(`------- ${label} -------`);
  output += ("\n" + strArray.join('\n'));
  output += ("\n" + colors[color].bold(closeLines));

  // Добавить в стораж, удалить через промежуток времени, при получении нового проверить если нет старого
  if(this.storage.has(output)) {
    return
  }
  this.storage.set(output, label); 
  this.publish(output, label); 

  setTimeout(function() {
    this.storage.delete(output);
  }.bind(this), 1000);
}

logger.prototype.publish = function (message, label) {
  if (this.options.handler) {
    return this.options.handler(message, label);
  } else {
    console.log(message, label);
  }
}
logger.prototype.log = function (message, target) {
  let label = target ? 'Log: ' + target : 'Log';
  this.decorate(message, label, 'white');
}
logger.prototype.success = function (message, target) {
  let label = target ? 'Success: ' + target : 'Success';
  this.decorate(message, label, 'green');
}
logger.prototype.warning = function (message, target) {
  let label = target ? 'Warning: ' + target : 'Warning';
  this.decorate(message, label, 'yellow');
}
logger.prototype.error = function (message, target) {
  if (message instanceof Error) {
    message = message.stack; //  message.name + ':' + message.message + '\n' +
  }
  let label = target ? 'Error: ' + target : 'Error';
  this.decorate(message, label, 'red');
}
class App extends skeleton {
  constructor() {
    super({}, {}, {
      command: ""
    });
    this.logger = new logger({
      handler: (message, label) => {
        if (this.rl) {
          message = '\n' + message;
        }
        console.log(message);
        if (this.rl) {
          this.rl.next();
        }
        if (label.toLowerCase().indexOf('project ready') != -1 && !this.ready) {
          this.ready = true;
          this.createReadline(this.appMenu, {
            context: this
          });
        }     
      }
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
      .command('init', "Initial initialization of the project", args => {
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
  async createReadline(func, opts) {
    this.rl = new readline(func, opts);
  }
  async initialize() {
    let config = this.config;

    if (['init', 'run'].indexOf(config.command) == -1) {
      console.log(colors.yellow.bold('To get started with ungic, you need to follow these simple steps:'));
      console.log(colors.yellow('● Select a previously prepared directory or new empty directory'));
      console.log(colors.yellow('● Initialize a new project using <ungic init> command'));
      console.log(colors.yellow('● Run with <ungic run> command'));
      require('yargs').showHelp();
      return;
    }

    this.app = new ungic(config);

    if (config.log) {
      console.log(colors.cyan('Log output to console enabled. You can disable this option using the "--log false" command.'));
    } else {
      console.log(colors.cyan('Log output to console disabled. You can enable this option using the "--log true" command.'));
    }
    this.app.on('log', (type, message, args = {}) => {
      if (!config.log && ['success', 'error'].indexOf(type) == -1) {
        return;
      }
      if (type == 'log') {
        this.logger.log(message, args.plugin_id ? args.plugin_id : false);
      } else if (type == 'error') {
        this.logger.error(message, args.plugin_id ? args.plugin_id : false);
      } else if (type == 'warning') {
        this.logger.warning(message, args.plugin_id ? args.plugin_id : false);
      } else if (type == 'success') {
        this.logger.success(message, args.plugin_id ? args.plugin_id : false);
      } else if (args.exit) {
        process.exit(0);
      }
    });
    this.on('log', (type, message) => {
      if (!config.log && ['success', 'error'].indexOf(type) == -1) {
        return;
      }
      if (type == 'log') {
        this.logger.log(message);
      } else if (type == 'error') {
        this.logger.error(message);
      } else if (type == 'warning') {
        this.logger.warning(message);
      } else if (type == 'success') {
        this.logger.success(message);
      }
    });
    if (config.command == 'init') {
      await this.app.initialize();
    }
    if (config.command == 'run') {
      await this.app.begin();
    }
    let self = this;
    this.appMenu = async function(yargs) {   
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
              this.logger.log(colors.cyan('Log output to the console is activated'));
            } else {
              this.logger.log(colors.cyan('Log output to the console is deactivated'));
            }
          }
        });


        let cliModes = fg.sync('./bin/cli/*.js', { cwd: __dirname });
    
        if (cliModes.length) {
          for (let handler of cliModes) {
            let name = path.basename(handler, path.extname(handler));           
            yargs
              .command(name, `switch to ${name} menu`, {}, () => {
                this.close().then(() => {
                  self.createReadline(async function (yargs) {
                    try {
                      require(handler).call(self, yargs, async(callback) => {
                          await this.close();
                        try {
                          await callback();
                        } catch (e) {                        
                          self.logger.error(e, 'CLI');
                        }
                        this.open();
                      });
                    } catch(e) {
                      console.log(e);
                    }
                  }, {
                    context: self,
                    prefix: name,
                    backCallback: () => {
                      self.createReadline(self.appMenu, {
                        context: self
                      });
                    }
                  });
                });
              });
            }
          }
        
        yargs.argv;
    }
    this.logger.success('The project has been successfully launched and is ready to go.', 'Project ready');
  }
}

(async () => {
  let app = new App;
  try {
    await app.initialize();
  } catch (e) {
    console.log(e);
  }
})();