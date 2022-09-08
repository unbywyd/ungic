const _ = require('underscore');
const skeleton = require('./skeleton.js');
const Collector = require('./collector.js');

class renderMaster extends skeleton {
    constructor(options={}, callback) {
        if('function' != typeof callback) {
            throw new Error('callback must be a function');
        }
        super({
            id: {
                type: 'string',
                required: true
            },
            timeout: {
                type: 'number',
                default: 0
            },
            pause: {
                type: 'boolean',
                default: false
            },
            autorun: {
                type: 'boolean',
                default: false
            }
        }, {}, options);
        let config = this.config;
        this.collector = new Collector(config);
        this.callback = callback;
        this.collector.on('finish', events => {           
            for(let event of events) {
                this.log(`A new "${event.description}" rendering event for ${config.id} was received.`);
            }
            this.events = _.uniq(_.union(this.events, events));
            if(config.autorun && this.launched) {
                this.run().then(()=> {
                    let status = this.status();
                    if(status.clean) {
                        this.log(`Process completed`);
                    }
                });
            }
        });
        this.events = [];
    }
    async run() {
        this.launched = true;
        let config = this.config, status = this.status();
        if(status.clean || config.pause || !this.events.length) {
            return;
        }
        let events = _.clone(this.events);

        this.events = _.without(this.events, ...events);

        events = _.uniq(events, function(x){
            return x.description;
        });

        try {
            if(this.callback.constructor.name === 'AsyncFunction') {
                await this.callback(events);
            } else {
                this.callback(events);
            }
        } catch(e) {
            console.log(e);
            this.error(e);
        }
        return
    }
    pause(pause=true) {
        this.setConfig({pause});
    }
    status() {
        let config = this.config;
        return {
            paused: config.pause,
            clean: !(this.collector.storage.length || this.events.length),
            events: this.events
        }
    }
    add(event) {       
        this.collector.add(event, !this.launched);
    }
}

module.exports = renderMaster;