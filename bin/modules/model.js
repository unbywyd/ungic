const EventEmitter = require('events');
const _ = require('underscore');
const underscoreExtends = require('./underscore-extends');
const Ajv = require('ajv');
class events extends EventEmitter{};
const merge = require('deepmerge');

class Model {
    constructor(attributes={}, options={}) {
        this._events = new events;
        this._config = options;
        this._ajv = new Ajv({useDefaults: true});
        this._changed = (attributes, event) => {
            this.changed = {};
            this._events.emit('change', event, attributes);
            for(let attr in attributes) {
                this.changed[attr] = attributes[attr];
                this._events.emit('change:' + attr, event, attributes[attr]);
            }
        }

        this.id = `f${(+new Date).toString(16)}`;
        this.attributes = {};
        if(this.schema) {
            this._ajv.addSchema(this.schema, 'validation');
        }
        this._ajv.validate('validation', this.attributes);
        this.changed = {};
        this.set(attributes, {silent: true});
    }
    _setError(errors) {
        if(!errors) {
           errors = this._getErrors();
        }
        if('string' == typeof errors) {
            errors = [errors];
        }
        if(this._events.listeners('errors').length) {
            this._events.emit('errors', errors.map(e => 'object' != typeof e ? {message:e} : e));
        } else {
            throw new Error(errors.map(e=> typeof e == 'object' ? JSON.stringify(e, null, 4) : e).join(','));
        }
        return false;
    }
    _getErrors() {
        return this._ajv.errorsText();
    }
    _validation(attributes, setError=true) {
        let response = true;
        if(this.schema) {
            response = this._ajv.validate('validation', attributes);
        }
        if(setError && !response) {
            return this._setError();
        }
        return response;
    }
    _set(attribute, value, options={}) {
        if(attribute == 'id') {
            this.id = value;
        }
        let changed = {};
        let prevValue = this.get(attribute);
        if(options.objectMerge && 'object' == typeof prevValue) {
            value = merge(prevValue, value, {
                arrayMerge: (destinationArray, sourceArray) => _.union(destinationArray, sourceArray)
            });
        }
        this.attributes[attribute] = value;

        let toChange = () => {
            let data = {prev: prevValue, actual: value};
            if(prevValue == undefined && prevValue!=value) {
                data.isNew = true;
            }
            changed[attribute] = data
        }
        if(typeof prevValue == 'object' && typeof value == 'object') {
            if(JSON.stringify(prevValue) !== JSON.stringify(value)) {
                toChange();
            }
        } else {
            if(prevValue !== value) {
                toChange();
            }
        }
        return changed;
    }
    on(event, callback) {
        this._events.on(...arguments);
    }
    clear(options={}) {
        let changed = {};
        for(let attr in this.attributes) {
            changed = Object.assign({}, changed, this.unset(attr, {
                silent: true,
            }));
        }
        if(!this._validation(this.attributes)) {
            return;
        }
        for(let attr in changed) {
            changed[attr].actual = this.attributes[attr];
        }
        if(!options.silent) {
            this._changed(changed, 'clear');
        }
    }
    unset(attribute, options={}) {
        let prev = this.get(attribute);
        if(!this.has(attribute)) {
            return;
        }
        delete this.attributes[attribute];
        let changed = {};
        changed[attribute] = {
            prev,
            isRemoved: true
        }
        if(!options.silent) {
            if(!this._validation(this.attributes)) {
                return;
            }
            changed[attribute].actual = this.attributes[attribute];
            this._changed(changed, 'unset');
        }
        return changed;
    }
    set(attribute, value, options={}) {
        let changed = {};
        let attributes = {};
        if('object' != typeof attribute) {
            attributes[attribute] = value;
        } else {
            attributes = attribute;
            if('object' == typeof value) {
                options = value;
            }
        }

        if('function' == typeof this._config.attrPrehandler) {
            attributes = this._config.attrPrehandler.call(this, attributes);
        }
        options = _.extend({
            merge: true,
            objectMerge: false
        }, this._config, options);

        if(!options.merge) {
            attributes = _.extend({}, attributes);
        } else {
            attributes = _.extend({}, this.attributes, attributes);
        }

        if(!this._validation(attributes)) {
            return;
        }

        for(let attr in attributes) {
            let setted = this._set(attr, attributes[attr], options);
            changed = Object.assign({}, changed, setted);
        }

        this.changed = changed;

        if(Object.keys(changed).length && !options.silent) {
            this._changed(changed, 'set');
        }
    }
    has(attribute) {
        return this.attributes[attribute] !== undefined ? true : false
    }
    get(attribute, options={}) {
        if(!attribute) {
            return (options.id) ? _.extend({id: this.id}, this.attributes) : this.attributes;
        }
        return this.attributes[attribute];
    }
    toJSON(options={}) {
        let output = (options.id) ? _.extend({id: this.id}, this.attributes) : this.attributes;
        return (options.stringify) ? JSON.stringify(output) : _.clone(output);
    }
}

underscoreExtends(Model, [
    'keys',
    'values',
    'pairs',
    'invert',
    'pick',
    'omit',
    'clone',
    'has',
    'isEmpty'], 'attributes');

module.exports = {
    extend: function(properties) {
        class model extends Model {};
        let required = [];
        for(let prop in properties) {
            if('object' == typeof properties[prop] && 'boolean' == typeof properties[prop].required && properties[prop].required) {
                required.push(prop);
                delete properties[prop].required;
            }
        }
        model.prototype.schema = {
            type: 'object',
            properties,
            required
        }
        return model;
    }
}