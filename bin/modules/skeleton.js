const EventEmitter = require('events');
class events extends EventEmitter{};
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { promisify } = require("util");
fsp.exists = promisify(fs.exists);
const {extend:Model} = require('./model');
class ungicStructure {
    constructor(modelScheme={}, modelOptions={}, config) {
        this._model = Model(modelScheme);
        this._modelConfiguration = modelOptions;
        this._events = new events();
        this._config = {};
        if(config) {
            this._config = new this._model(config, this._modelConfiguration);
        }
        this.appRoot = path.join(__dirname, '../../');
        if('string' == typeof config) {
            let configPath = path.join(this.appRoot, path.extname(config) != '' ? config : config + '.json');
            if(!fs.existsSync(configPath)) {
                config = {};
            } else {
                config = fs.readFileSync(configPath, 'UTF-8');
            }
            this.setConfig(config);
        }
        if('object' == typeof config) {
            this.setConfig(config);
        }
    }
    on() {
        this._events.on(...arguments);
    }
    emit() {
        this._events.emit(...arguments);
    }
    removeListener() {
        this._events.removeListener(...arguments);
    }
    off() {
        this._events.off(...arguments);
    }
    log(message, type="log", args={}) {
        if(message instanceof Error) {
            type = 'error';
            message = message.message;
        }
        this._events.emit('log', type, message, args);
    }
    error(message, args={}) {
        this.log(message, 'error', args);
    }
    system(message, message_type = 'system', args={}) {
        args.message_type = message_type;
        this.log(message, 'system', args);
    }
    warning(message, args={}) {
        this.log(message, 'warning', args);
    }
    get config() {
        return this._config.toJSON();
    }
    setConfig(config, options={}) {
        if('string' == typeof config) {
            try {
                config = JSON.parse(config);
            } catch(e) {
                throw new Error(`Configuration error: ${e.message}`);
            }
        }
        if(!Object.keys(this._config).length) {
            this._config = new this._model(config, this._modelConfiguration);
            return;
        }
        this._config.set(config, options);
    }
}

module.exports = ungicStructure;