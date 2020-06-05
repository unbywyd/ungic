const skeleton = require('./skeleton.js');
const Timer = require('./timer.js');
const _ = require('underscore');

class Collector extends skeleton {
    constructor(options={}) {
        super({
            timeout: {
                type: 'number',
                default: 0
            }
        }, {}, options);
        let config = this.config;
        this.timer = new Timer(config.timeout);
        this.timer.on('finish', () => {
            this._finish();
        });
        this.storage = [];
    }
    add(item, skipTimer) {
        this.storage.push(item);
        if(this._pause) {
            return
        }
        if(skipTimer) {
            this.timer.setTime(0);
        }
        this.timer.update();
    }
    pause() {
        this._pause = true;
        this.timer.pause();
    }
    run() {
        this._pause = false;
        this.timer.update();
    }
    _finish() {
        if(this._pause) {
            return
        }
        this.storage = _.uniq(this.storage);
        if(this.storage.length) {
            let storage = _.clone(this.storage);
            this.storage = _.without(this.storage, ...storage);
            this.emit('finish', storage);
        }
    }
}
module.exports = Collector;