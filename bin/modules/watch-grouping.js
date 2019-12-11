const EventEmitter = require('events');
const _ = require('underscore');
class events extends EventEmitter{};
const fse = require('fs-extra');
const path = require('path');
function watchEventGrouping(options={}) {
	this.options = _.extend({
		timeOutDefault: 500,
		timeOuts: {
			change: 0
		}
	}, options);
	this.events = [];
	this.eventManager = new events;
	let methods = {
		move: (_prev, _new) => {
			for(let event in _new) {
				if(!_prev[event]) {
					_prev[event] = [];
				}
				_prev[event] = _prev[event].concat(_new[event]);
			}
			return;
		},
		timer: function(cb, time=500) {
			let Timer = () => {
				this.timer = setTimeout(function() {
					this.finish = true;
					delete this.timer;
					cb();
				}.bind(this), time);
			}
			Timer();
			return {
				is_actual: () => {
					return !this.finish;
				},
				update: () => {
					if(this.timer) {
						clearTimeout(this.timer);
						Timer();
					}
				}
			}
		},
		process:(events) => {
			events = events ? events : this.events;

			_.map(events, e => {
				e.dirname = path.dirname(e.path);
				e.isFile = path.extname(e.path) != '' && e.path.slice(-1) != path.sep ? true : false;
			});

			let byDirs = _.groupBy(events, 'event');
			for(let event in byDirs) {
				byDirs[event] = _.reject(byDirs[event], e=> _.find(byDirs[event], {path: e.dirname}));
			}
			return byDirs;
		},
		endTimer: () => {
			if(this.events.length) {
				let events = _.clone(this.events);
				this.events = [];
				let res = methods.process(events);
				this.eventManager.emit('ready', res);
			}
			delete this.time;
		},
		bind: (event, ph) => {
			this.events.push({
				event, path: ph
			});
			if(!this.time) {
				let time = this.options.timeOuts[event] != undefined ? this.options.timeOuts[event] : this.options.timeOutDefault;
				this.time = new methods.timer(methods.endTimer, time);
			} else {
				if(this.time.is_actual()) {
					this.time.update();
				}
			}
		}
	}
	this.eventManager.on('bind', methods.bind);
	return this.eventManager;
}
module.exports = watchEventGrouping;