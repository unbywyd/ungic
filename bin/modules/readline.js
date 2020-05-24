let yargs = require('./yargs');
function ungicReadline(callback, prefix='', closeCallback) {
    this.prefix = 'ungic: ';
    this.closeCallback = closeCallback;
    this.callback = callback;
    if(prefix) {
        this.prefix = `ungic ${prefix}: `;
    }
    this.begin = (withOutLabel) => {
        let data = {
            input: process.stdin,
            output: process.stdout
        }
        if(!withOutLabel) {
           data.prompt = this.prefix;
        }
        this.rl = require('readline').createInterface(data);
        this.rl.on('line', input => {
            if(input.replace(/\s\n/g, '') == '') {
                return this.rl.prompt();
            }
            if(!this._pause) {
                this.rl.pause();
                this._pause = true;
            }
            callback.call(this, yargs.call(this, input, this.done).command('exit', 'Exit active menu or application', yargs => {
                return yargs.option('force', {
                    alias: 'f',
                    type: 'boolean',
                    description: 'Exit the application'
                })
            }, args => {
                if(args.f) {
                    this.rl.close();
                    process.exit(0);
                    return;
                }
                this.close();
            }), () => {
                this.done();
            });
        }).on('close', () => {
            if(this._toClose || !this._toClose && !this.woExit) {
                if(prefix == '') {
                    process.exit(0);
                } else if('function' == typeof closeCallback) {
                    closeCallback();
                }
            }
        });
        this.rl.prompt();
    }
    this.begin();
    this.done = () => {
        if(this._pause) {
            this.rl.resume();
            this._pause = false;
        }
        this.rl.prompt();
    }
    this.close = () => {
        this._toClose = true;
        this.rl.close();
    }
    this.toClose = () => {
        this.woExit = true;
        this.rl.close();
        this.woExit = false;
    }
    return this;
}


module.exports = ungicReadline;