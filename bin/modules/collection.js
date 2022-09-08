const _ = require('underscore');
const EventEmitter = require('events');
class events extends EventEmitter{};
const underscoreExtends = require('./underscore-extends');

class Collection {
    constructor(config={}) {
        this._events = new events;
        this._options = {
            add: true
        }
        this._change =  (event, data) => {
            this._events.emit(event, data);
            this._events.emit('all', event, data);
        }
        this._config = {
            eventForEvery: true 
        }
        this.collection = [];
        this._config = _.extend(this._config, config);
        if(config.options) {
            this._options = _.extend(this._options, config.options);
        }
    }
    _setError(errors) {
        if(!Array.isArray(errors)) {
            errors = [errors];
        }
        if(this._events.listeners('errors').length) {
            this._events.emit('errors', errors.map(e => 'object' != typeof e ? {message:e} : e));
        } else {
            throw new Error(errors.map(e=> typeof e == 'object' ? JSON.stringify(e, null, 4) : e).join(','));
        }
        return false;
    }
    _insert(model, options) {
        let at = typeof options.at == 'number' ? options.at : this.size();
        this.collection.splice(at, 0, model);
        if(!options.silent) {
            this._change('added', model);
        }
        return model;
    }
    async _update(id, attributes, options) {
        let model = this.find(model => model.id == id);
        if(!attributes) {
            return;
        }
        if(!options.merge) {
            model.clear({silent:true});
        }
        model.set(attributes, options);
        //console.log(model.changed);
        if(!options.silent && _.keys(model.changed).length) {
            this._change('updated', model);
        }
        return model;
    }
    _remove(model, options) {
        if('string' == typeof model) {
            model = this.find(m => m.id == model);
        }
        if(model) {
            let id = model.id;
            this.collection = this.without(model);
            if(!options.silent) {
                if(this._config.eventForEvery) {
                    this._change('removed', model);
                } else {
                    this._change('removed', [model]);
                }
            }
            return model;
        }
    }
    _isModel(model) {
        return model instanceof this._model;
    }
    async _create(attributes, options) {
        if(!attributes) {
            return;
        }
        let model;
        if('object' == typeof attributes) {
            try {
                model = new this._model(attributes);
            } catch(e) {
                model = this._setError({
                    message: "Object does not meet model requirements",
                    origin: e.message,
                    attributes
                });
            }
        }
        model.on('change', (event, data) => {
            this._events.emit('model', model, event, data);
        });
        return model;
    }
    async _set(models, options={}) {
        options = _.extend({}, this._options, options);

        if(!Array.isArray(models) && models) {
            models = [models];
        }
        models = _.reject(models, model => {
            if(Array.isArray(model) || !_.isObject(model)) {
                return this._setError('Collection item must be a model or object');
            }
            if(!this._isModel(model) && model.constructor.name == 'model') {
                return this._setError('This collection does not support this type of model');
            }
        });

        let changed = [];
        if(!models.length) {
            return changed;
        }
        if(options.remove) {
            // Удаляет все кроме этой
            let modelsWithIDs = _.filter(models, m => m.id);
            if(modelsWithIDs.length) {
                this.each(model => {
                    if(!_.find(modelsWithIDs, m => m.id == model.id)) {
                        let removed = this._remove(model, options);
                        changed.push({
                            event: "removed",
                            model: removed
                        });
                    }
                });
            }
        }
        for(let model of models) {
            if(this._isModel(model)) {
                if(!this.has(model.id) && options.add) {
                    let inserted = this._insert(model, options);
                    changed.push({
                        event: "added",
                        model: inserted
                    });
                } else if(this.has(model.id)) {
                    let updated = await this._update(model.id, model.get(), options);
                    if(updated && _.keys(updated.changed).length) {
                        changed.push({
                            event: "updated",
                            model: updated
                        });
                    }
                }
            } else {
                if('function' == typeof this._config.attrPrehandler) {
                    let attrs = await this._config.attrPrehandler(model);
                    if(attrs) {
                        model = attrs;
                    }
                }
                if(!this.has(model.id) && options.add) {
                    model = await this._create(model, options);
                    if(model) {
                        let inserted = this._insert(model, options);
                        changed.push({
                            event: "added",
                            model: inserted
                        });
                    }
                } else if(this.has(model.id) && model.id) {
                    let updated = await this._update(model.id, _.omit(model, 'id'), options);
                    if(updated && _.keys(updated.changed).length) {
                        changed.push({
                            event: "updated",
                            model: updated
                        });
                    }
                }
            }
        }
        return changed;
    }
    has(id) {
        return this.find(model => model.id == id) ? true : false;
    }
    on(event, callback) {
        this._events.on(...arguments);
    }
    async add(models, options={}) {
        options.remove = "remove" in options ? options.remove : false;
        options.merge = "merge" in options ? options.merge : true;
        let changed = await this._set(models, options);
        if(!options.silent && changed.length) {
            this._change('add', changed);
        }
        if(changed.length) {
            for(let model of changed) {
                this._events.emit('__added', model);
            }
        }
    }
    async set(models, options={}) {
        options = _.extend({
            remove: Array.isArray(models),
            merge: "merge" in options ? options.merge : false
        }, options);
        let changed = await this._set(models, options);
        if(!options.silent && changed.length) {
            this._change('set', changed);
        }
        if(changed.length) {
            for(let model of changed) {
                this._events.emit('__set', model);
            }
        }
    }
    sort() {
        return this.collection = this.sortBy(...arguments);
    }
    get(id) {
        if(!id) {
            return this.collection;
        }
        return this.find(model => model.id == id);
    }
    at(index) {
        return this.collection[index];
    }
    push(models, options={}) {
        options.remove = false;
        return this._set(models, options);
    }
    unshift(models, options={}) {
        options.remove = false;
        options.at = 0;
        return this._set(models, options);
    }
    pop(options={}) {
        let model = this.last();
        if(model) {
            return this._remove(model, options);
        }
        return model;
    }
    slice(begin, end) {
        return this.collection.slice(...arguments);
    }
    shift(options={}) {
        let model = this.first();
        if(model) {
            return this._remove(model, options);
        }
    }
    remove(models, options={}) {
        if(!Array.isArray(models) && models) {
            models = [models];
        }
        models = _.reject(models, model => {
            if(!_.isObject(model) || Array.isArray(model) || (!this._isModel(model) && model.constructor.name == 'model')) {
                return;
            }
        });
        if(!models.length) {
            return
        }
        let removed = [];   
    
        for(let model of models) {
            removed.push(this._remove(model, {silent: true}));
        }
        if(!options.silent) {
            if(this._config.eventForEvery) {
                if(Array.isArray(removed)) {
                    for(let model of removed) {
                        this._change('removed', model);
                    }
                }
            } else {
                this._change('removed', removed);
            }
        }
        if(removed.length) {
            for(let model of removed) {
                this._events.emit('__removed', model);
            }
        }
    }
    pluck(attr, options={}) {
        return _.pluck(this.toJSON(options), attr);
    }
    findByID(id) {
        return this.find(model=>model.id == id);
    }
    where(properties) {
        let ids = _.chain(this.toJSON({id: true})).where(properties).pluck('id').value();
        let results = [];
        if(ids.length) {
            results = _.filter(this.collection, model=> ids.indexOf(model.id) != -1);
        }
        return results;
    }
    findWhere(properties, JSONFormat=true) {
        let attrs = _.chain(this.toJSON({id: true})).find(properties).value();
        if(JSONFormat) {
            return attrs;
        }
        if(attrs) {
            return this.findByID(attrs.id);
        }
    }
    findAllWhere(properties, JSONFormat=true) {
        let attrs = _.chain(this.toJSON({id: true})).where(properties).value();
        if(JSONFormat) {
            return attrs;
        }
        if(attrs.length) {
            let ids = _.pluck(attrs, 'id');
            return _.filter(this.collection, m=> ids.indexOf(m.id) != -1);
        }
    }
    async reset(models, options={}) {
        this.collection = [];
        let changed;
        if(models) {
            changed = await this._set(models, {silent: true, add: true, remove: true, merge: true});
        }
        if(!options.silent) {
            this._change('reset', changed);
        }
    }
    async create(attrs, options={}) {
        if(Array.isArray(attrs) || !_.isObject(attrs)) {
            return this._setError('Attributes must be an object');
        }
        let model = await this._create(attrs, options);
        if(model) {
            if(!options.silent) {
                this._change('create', model);
            }
            this._insert(model, options);
        }
        return model;
    }
    toJSON(options={}) {
        let output = this.collection.map(model => model.toJSON({id: options.id}));
        if(options.stringify) {
            output = JSON.stringify(output);
        }
        return output;
    }
    get length() {
        return this.size();
    }
}

underscoreExtends(Collection, [
            'each',
            'map',
            'reduce',
            'reduceRight',
            'find',
            'filter',
            'reject',
            'every',
            'some',
            'contains',
            'invoke',
            'max',
            'min',
            'sortBy',
            'groupBy',
            'indexBy',
            'countBy',
            'shuffle',
            'sample',
            'toArray',
            'size',
            'partition',
            'first',
            'initial',
            'last',
            'rest',
            'compact',
            'without',
            'difference',
            'indexOf',
            'lastIndexOf',
            'sortedIndex',
            'isEmpty',
            'chain'], 'collection');

module.exports = {
    extend: function(model) {
        class collection extends Collection {};
        collection.prototype._model = model;
        return collection;
    }
}