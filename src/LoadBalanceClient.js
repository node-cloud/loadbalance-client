import _ from 'lodash';

import {md5} from './Util';

import * as http from './HttpClient';
import * as loadBalance from './LoadBalance';
import ServiceWatcher from './ServiceWatcher';
import RefreshingEvent from './RefreshingEvent';

const REFRESHING_SERVICE_LIST_EVENT = 'refreshing-services';

/**
 * An http client with load balance.
 */
export default class LoadBalanceClient {
    constructor(serviceName, consul, options = {}) {
        this.options = options = options || {};
        this.requestOptions = options.request || {};
        this.serviceName = serviceName;
        this.consul = consul;
        this.engineCache = {};
        this.watcher = new ServiceWatcher(serviceName, consul, options);
        this.initWatcher();
        this.event = new RefreshingEvent();
    }

    on(eventName, callback) {
        this.event.on(eventName, callback);
    }

    off(eventName, callback) {
        this.event.removeListener(eventName, callback);
    }

    async send(options) {
        if (!options) {
            throw new Error(`No options was given, please give an options before send api request.`);
        }

        for (let key in this.requestOptions) {
            if (!this.requestOptions.hasOwnProperty(key) || options[key]) {
                continue;
            }

            options[key] = this.requestOptions[key];
        }
        const endpoint = await this.getEndpoint();

        let request = {};
        for (let key in options) {
            if (!options.hasOwnProperty(key)) {
                continue;
            }

            if (key === 'url') {
                request[key] = endpoint + options[key];
            } else {
                request[key] = options[key];
            }

        }

        return http.send(request);
    }

    get(options = {}) {
        options.method = 'GET';
        return this.send(options);
    }

    post(options = {}) {
        options.method = 'POST';
        return this.send(options);
    }

    del(options = {}) {
        options.method = 'DELETE';
        return this.send(options);
    }

    put(options = {}) {
        options.method = 'PUT';
        return this.send(options);
    }

    /**
     * Get a http endpoint.
     * @return {Promise.<string>}
     */
    async getEndpoint() {
        let service = null;
        try {
            service = await this.getService();
        } catch (e) {
            throw new Error('Get consul service error.');
        }

        if (!service) {
            throw new Error(`No service '${this.serviceName}' was found.`);
        }

        return `http://${service.Service.Address}:${service.Service.Port}`;
    }

    /**
     * Get a available service by load balance.
     * @return {Promise.<void>}
     */
    async getService() {
        if (!this.engineCache[this.serviceName]) {
            let options = this.options;
            options.service = this.serviceName;
            if (!_.has(options, 'passing')) {
                options.passing = true;
            }

            const services = await new Promise((resolve, reject) => {
                this.consul.health.service(options, (err, result) => {
                    if (err) {
                        return reject(err);
                    }

                    resolve(result);
                });
            });

            const wrapper = {
                engine: loadBalance.getEngine(services, this.options.strategy || loadBalance.RANDOM_ENGINE),
                hash: md5(JSON.stringify(services))
            };

            this.engineCache[this.serviceName] = wrapper;

            this.event.on(REFRESHING_SERVICE_LIST_EVENT, services, wrapper.hash);
        }

        return this.engineCache[this.serviceName].engine.pick();
    }

    /**
     * Init consul services change listener.
     */
    initWatcher() {
        this.watcher.watch();
        this.watcher.change(services => {
            let wrapper = this.engineCache[this.serviceName];
            let hash = md5(JSON.stringify(services));
            if (wrapper && hash !== wrapper.hash) {
                wrapper.engine.update(services);
                wrapper.hash = hash;

                this.event.on(REFRESHING_SERVICE_LIST_EVENT, services, hash, wrapper.hash);
            } else if (!wrapper) {
                wrapper = {
                    engine: loadBalance.getEngine(services, loadBalance.RANDOM_ENGINE),
                    hash: hash
                };

                this.event.on(REFRESHING_SERVICE_LIST_EVENT, services, hash);
            }

            this.engineCache[this.serviceName] = wrapper;
        });

        return this.watcher;
    }
}