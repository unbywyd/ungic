const EventEmitter = require('events');
class events extends EventEmitter{};
class Timer {
    constructor(time=0) {
        this._time = time;
        this._events = new events();
    }
    _timer() {
        this.time = this._time;
        this.timer = setTimeout(function() {
            delete this.timer;
            this._events.emit('finish');
        }.bind(this), this.time);
    }
    pause() {
        this._pause = true;
    }
    _end() {
        if(this._pause) {
            return
        }
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
        this._pause = false;
        if(this.timer) {
            clearTimeout(this.timer);
        }
        this._timer();
    }
}

module.exports = Timer;