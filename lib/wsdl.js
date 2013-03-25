/* 
 * Copyright (c) 2011 Vinay Pulim <vinay@milewise.com>
 * Copyright (C) 2013 Florian Purnhagen <florian.purnhagen@gmail.com> 
 * MIT License
 */

 var xmlParser = require('node-xml');
 var inherits = require('util').inherits;
 var http = require('./http');
 var fs = require('fs');
 var url = require('url');
 var path = require('path');
 var assert = require('assert').ok;
 var helper = require('./helper');
 var element = require('./element');

var WSDL = function(definition, uri, options) {
    var self = this,
        fromFunc;

    this.uri = uri;
    this.callback = function() {};
    this.options = options || {};

    if (typeof definition === 'string') {
        fromFunc = this._fromXML;
    }
    else if (typeof definition === 'object') {
        fromFunc = this._fromServices;
    }
    else {
        throw new Error('WSDL constructor takes either an XML string or service definition');
    }

    process.nextTick(function() {
        fromFunc.call(self, definition);

        self.processIncludes(function(err) {
            self.definitions.deleteFixedAttrs();
            var services = self.services = self.definitions.services ;
            if (services) {
                for (var name in services) {
                    services[name].postProcess(self.definitions);
                }
            }
            var complexTypes = self.definitions.complexTypes;
            if (complexTypes) {
                for (var name in complexTypes) {
                    complexTypes[name].deleteFixedAttrs();
                }
            }

            // for document style, for every binding, prepare input message element name to (methodName, output message element name) mapping
            var bindings = self.definitions.bindings;
            for(var bindingName in bindings) {
                var binding = bindings[bindingName];
                if(binding.style !== 'document') continue;
                var methods = binding.methods;
                var topEls = binding.topElements = {};
                for(var methodName in methods) {
                    var inputName = methods[methodName].input.$name;
                    var outputName = methods[methodName].output.$name;
                    topEls[inputName] = {"methodName": methodName, "outputName": outputName};
                }
            }

            // prepare soap envelope xmlns definition string
            self.xmlnsInEnvelope = self._xmlnsMap();
        
            self.callback(err, self);
        });
        
    })
}

WSDL.prototype.onReady = function(callback) {
    if (callback) this.callback = callback;
}

WSDL.prototype._processNextInclude = function(includes, callback) {
    var self = this,
        include = includes.shift();

    if (!include) return callback()

    var includePath;
    if (!/^http/.test(self.uri) && !/^http/.test(include.location)) {
        includePath = path.resolve(path.dirname(self.uri), include.location);
    } else {
        includePath = url.resolve(self.uri, include.location);
    }

    open_wsdl(includePath, function(err, wsdl) {
        if (err) {
            return callback(err);
        }

        self.definitions.schemas[include.namespace || wsdl.definitions.$targetNamespace] = wsdl.definitions;
        self._processNextInclude(includes, function(err) {
            callback(err);
        })
    });
}

WSDL.prototype.processIncludes = function(callback) {
    var schemas = this.definitions.schemas,
        includes = [];

    for (var ns in schemas) {
        var schema = schemas[ns];
        includes = includes.concat(schema.includes || [])
    }

    this._processNextInclude(includes, callback);
}

WSDL.prototype.describeServices = function() {
    var services = {};
    for (var name in this.services) {
        var service = this.services[name];
        services[name] = service.description(this.definitions);
    }
    return services;
}

WSDL.prototype.toXML = function() {
    return this.xml || '';
}

WSDL.prototype.xmlToObject  = function(xml) {
    var self = this,

        objectName = null,
        root = {},
        schema = { 
            Envelope: { 
                Header: {                                                                                                                                                              
                        Security: {                                                                                                                                                    
                            UsernameToken: {                                                                                                                                           
                                Username: 'string',                                                                                                                                    
                                Password: 'string' }}},    
                Body: { 
                    Fault: { faultcode: 'string', faultstring: 'string', detail: 'string' }}}},        
        stack = [{name: null, object: root, schema: schema}];
   
    var refs = {}, id; // {id:{hrefs:[],obj:}, ...}


    var parser = new xmlParser.SaxParser(function(cb) {
        cb.onStartElementNS(function(nsName, attrArray, prefix, uri, namespaces) {
            var attrs = a2o(attrArray)
            
            if (prefix != null){ 
                nsName = prefix + ':' + nsName
            }

            if(namespaces.length > 0){
               attrs = n2o(namespaces,attrs)
            }
             var name = helper.splitNSName(nsName).name,
                top = stack[stack.length-1],
                topSchema = top.schema,
                obj = {};
            var originalName = name;

            if (!objectName && top.name === 'Body' && name !== 'Fault') {
                var message = self.definitions.messages[name];
                // Support RPC/literal messages where response body contains one element named
                // after the operation + 'Response'. See http://www.w3.org/TR/wsdl#_names
                if (!message) {
                   // Determine if this is request or response
                   var isInput = false;
                   var isOutput = false;
                   if ((/Response$/).test(name)) {
                     isOutput = true;
                     name = name.replace(/Response$/, '');
                   } else if ((/Request$/).test(name)) {
                     isInput = true;
                     name = name.replace(/Request$/, '');
                   } else if ((/Solicit$/).test(name)) {
                     isInput = true;
                     name = name.replace(/Solicit$/, '');
                   }
                   // Look up the appropriate message as given in the portType's operations
                   var portTypes = self.definitions.portTypes;
                   var portTypeNames = Object.keys(portTypes);
                   // Currently this supports only one portType definition.
                   var portType = portTypes[portTypeNames[0]];
                   if (isInput) name = portType.methods[name].input.$name;
                   else name = portType.methods[name].output.$name;
                   message = self.definitions.messages[name];
                   // 'cache' this alias to speed future lookups
                   self.definitions.messages[originalName] = self.definitions.messages[name];
                }

                topSchema = message.description(self.definitions);
                objectName = originalName;
            }
                    
                    if(attrs.href) {
                        id = attrs.href.substr(1);
                        if(!refs[id]) refs[id] = {hrefs:[],obj:null};
                        refs[id].hrefs.push({par:top.object,key:name});
                    }
                    if(id=attrs.id) {
                        if(!refs[id]) refs[id] = {hrefs:[],obj:null};
                    }

            if (topSchema && topSchema[name+'[]']) name = name + '[]';
            stack.push({name: originalName, object: obj, schema: topSchema && topSchema[name], id:attrs.id});
        });

        cb.onEndElementNS(function(nsName, prefix, uri) {
            if (prefix != null){ 
                nsName = prefix + ':' + nsName
            }

            var cur = stack.pop(),
            obj = cur.object,
            top = stack[stack.length-1],
            topObject = top.object,
            topSchema = top.schema,
            name = helper.splitNSName(nsName).name;

            if (topSchema && topSchema[name+'[]']) {
                if (!topObject[name]) topObject[name] = [];
                topObject[name].push(obj);
            }
            else if (name in topObject) {
                if (!Array.isArray(topObject[name])) {
                    topObject[name] = [topObject[name]];
                }
                topObject[name].push(obj);
            }
            else {
                topObject[name] = obj;                        
            }

            if(cur.id) {            
                refs[cur.id].obj = obj;
            }

        });
        
        cb.onCharacters(function(text) {
            text = helper.trim(text);
            if (!text.length) return;

            var top = stack[stack.length-1];
            var name = helper.splitNSName(top.schema).name,
                value;
            if (name === 'int' || name === 'integer') {
                value = parseInt(text, 10);
            } else if (name === 'bool' || name === 'boolean') {
                value = text.toLowerCase() === 'true' || text === '1';
            } else if (name === 'dateTime') {
                value = new Date(text);
            } else {
                // handle string or other types
                if (typeof top.object !== 'string') {
                    value = text;
                } else {
                    value = top.object + text;
                }
            }
            top.object = value;
            })


    })

    
    parser.parseString(xml)
   
    // if (!parser.parse(xml, false)) {
    //     throw new Error(p.getError());
    // }
		
		for(var n in refs) {
			var ref = refs[n];
			var obj = ref.obj;
			ref.hrefs.forEach(function(href) {
				href.par[href.key] = obj;
			});
		}
		
    var body = root.Envelope.Body;
    if (body.Fault) {
        throw new Error(body.Fault.faultcode+': '+body.Fault.faultstring+(body.Fault.detail ? ': ' + body.Fault.detail : ''));
    }
    return root.Envelope;
}

WSDL.prototype.objectToDocumentXML = function(name, params, ns, xmlns) {
    var args = {};
    args[name] = params;
    return this.objectToXML(args, null, ns, xmlns);
}

WSDL.prototype.objectToRpcXML = function(name, params, namespace, xmlns) {
    var self = this,
        parts = [],
        defs = this.definitions,
        namespace = namespace || helper.findKey(defs.xmlns, xmlns),
        xmlns = xmlns || defs.xmlns[namespace],
        nsAttrName = '_xmlns';
    parts.push(['<',namespace,':',name,'>'].join(''));
    for (var key in params) {
        if (key != nsAttrName) {
            var value = params[key];
            parts.push(['<',key,'>'].join(''));
            parts.push((typeof value==='object')?this.objectToXML(value):helper.xmlEscape(value));            
            parts.push(['</',key,'>'].join(''));
        }
    }
    parts.push(['</',namespace,':',name,'>'].join(''));

    return parts.join('');
}

WSDL.prototype.objectToXML = function(obj, name, namespace, xmlns) {
    var self = this,
        parts = [],
        xmlnsAttrib = false ? ' xmlns:'+namespace+'="'+xmlns+'"'+' xmlns="'+xmlns+'"' : '',
        ns = namespace ? namespace + ':' : '';
    
    if (Array.isArray(obj)) {
        for (var i=0, item; item=obj[i]; i++) {
            if (i > 0) {
                parts.push(['</',ns,name,'>'].join(''));
                parts.push(['<',ns,name,xmlnsAttrib,'>'].join(''));
            }
            parts.push(self.objectToXML(item, name));
        }
    }
    else if (typeof obj === 'object') {
        for (var name in obj) {
            var child = obj[name];
            parts.push(['<',ns,name,xmlnsAttrib,'>'].join(''));
            parts.push(self.objectToXML(child, name));
            parts.push(['</',ns,name,'>'].join(''));
        }
    }
    else if (obj) {
        parts.push(helper.xmlEscape(obj));
    }
    return parts.join('');
}


//convert arrays to objects, to keep absolutely the same object structure as with expat
var a2o = function(a){
    var o = {}
    for(var i in a){
        var key = a[i][0]
        var val = a[i][1]
        o[key] = val
    }
    return o
}
//convert namespace info to objects, to keep absolutely the same object structure as with expat
var n2o = function(n,o){
    for(var i in n){
        var key = n[i][0]
        var val = n[i][1]

        if(key ==='') key = 'xmlns'
        else key = 'xmlns:'+key
        o[key] = val
    }
    return o
}


WSDL.prototype._parse = function(xml)
{
    var self = this;
    // var p = new expat.Parser('UTF-8');
    var stack = [];
    var root = null;


    var parser = new xmlParser.SaxParser(function(cb) {
        cb.onStartElementNS(function(nsName, attrArray, prefix, uri, namespaces) {
            var attrs = a2o(attrArray)
            
            if (prefix != null){ 
                nsName = prefix + ':' + nsName
            }

            if(namespaces.length > 0){
               attrs = n2o(namespaces,attrs)
            }
            var top = stack[stack.length - 1];
            if (top) {
                try {
                    top.startElement(stack, nsName, attrs);
                }
                catch(e) {
                    if (self.options.strict) {
                        throw e;
                    }
                    else {
                    	console.log("UDEF WETTEN")
                    	console.log (element.Element)
                    	 
                        
                    	
                    	stack.push(new element.Element(nsName, attrs));
                    }            
                }
            }
            else {
                var name = helper.splitNSName(nsName).name;
                if (name === 'definitions') {
                    root = new element.DefinitionsElement(nsName, attrs);
                }
                else if (name === 'schema') {
                    root = new element.SchemaElement(nsName, attrs);
                }
                else {
                    throw new Error('Unexpected root element of WSDL or include');
                }
                stack.push(root);
            }
        });
        cb.onEndElementNS(function(name, prefix, uri) {
            if (prefix != null){ 
                name = prefix + ':' + name
            }
            // console.log(name)
            var top = stack[stack.length - 1];
            assert(top, 'Unmatched close tag: ' + name);
            top.endElement(stack, name);
        });

    });


    parser.parseString(xml);
    
    return root;
}


WSDL.prototype._fromXML = function(xml) {
    this.definitions = this._parse(xml);
    this.xml = xml;
}

WSDL.prototype._fromServices = function(services) {
       
}



WSDL.prototype._xmlnsMap = function() {
    var xmlns = this.definitions.xmlns;
    var str = '';
    for (var alias in xmlns) {
        if (alias === '') continue;
        var ns = xmlns[alias];
        switch(ns) {
            case "http://xml.apache.org/xml-soap" : // apachesoap
            case "http://schemas.xmlsoap.org/wsdl/" : // wsdl
            case "http://schemas.xmlsoap.org/wsdl/soap/" : // wsdlsoap
            case "http://schemas.xmlsoap.org/soap/encoding/" : // soapenc
            case "http://www.w3.org/2001/XMLSchema" : // xsd
                continue;
        }
        if (~ns.indexOf('http://schemas.xmlsoap.org/')) continue;
        if (~ns.indexOf('http://www.w3.org/')) continue;
        if (~ns.indexOf('http://xml.apache.org/')) continue;
        str += ' xmlns:' + alias + '="' + ns + '"';
    }
    return str;
}

function open_wsdl(uri, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    var wsdl;
    if (!/^http/.test(uri)) {
        fs.readFile(uri, 'utf8',  function (err, definition) {
            if (err) {
                callback(err)
            }
            else {
                wsdl = new WSDL(definition, uri, options);
                wsdl.onReady(callback);
            }
        })
    }
    else {        
        http.request(uri, null /* options */, function (err, response, definition) {
            if (err) {
                callback(err);
            }
            else if (response && response.statusCode == 200) {
                wsdl = new WSDL(definition, uri, options);
                wsdl.onReady(callback);
            }
            else {
                callback(new Error('Invalid WSDL URL: '+uri))
            }
        }, options.exHeaders);   
    }    

    return wsdl;
}

exports.open_wsdl = open_wsdl;
exports.WSDL = WSDL;


