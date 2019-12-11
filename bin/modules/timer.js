const EventEmitter = require('events');
class events extends EventEmitter{};
class Timer {
    #time=0;
    constructor(time=0) {
        this.#time = time;
        this._events = new events();
    }
    _timer() {
        this.time = this.#time;
        this.timer = setTimeout(function() {
            delete this.timer;
            this._events.emit('finish');
        }.bind(this), this.time);
    }
    _end() {
        this._events.emit('finish');
    }
    on() {
        this._events.on(...arguments);
    }
    emit() {
        this._events.emit(...arguments);
    }
    is_actual() {
        return this.timer ? true : false;
    }
    setTime(time) {
        this.time = time;
    }
    update() {
        if(this.timer) {
            clearTimeout(this.timer);
        }
        if(!this.time) {
            return this._end();
        }
        this._timer();
    }
}

module.exports = Timer;