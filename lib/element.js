 /* 
 * Copyright (c) 2011 Vinay Pulim <vinay@milewise.com>
 * Copyright (C) 2013 Florian Purnhagen <florian.purnhagen@gmail.com> 
 * MIT License
 */

 var assert = require('assert').ok;
 var helper = require('./helper');


var Primitives = {
    string: 1, boolean: 1, decimal: 1, float: 1, double: 1,
    anyType: 1, byte: 1, int: 1, long: 1, short: 1, 
    unsignedByte: 1, unsignedInt: 1, unsignedLong: 1, unsignedShort: 1,
    duration: 0, dateTime: 0, time: 0, date: 0,
    gYearMonth: 0, gYear: 0, gMonthDay: 0, gDay: 0, gMonth: 0, 
    hexBinary: 0, base64Binary: 0, anyURI: 0, QName: 0, NOTATION: 0
};



var Element = function(nsName, attrs) {
    var parts = helper.splitNSName(nsName);

    this.nsName = nsName;
    this.namespace = parts.namespace;
    this.name = parts.name;
    this.children = [];
    this.xmlns = {};
    for (var key in attrs) {
        var match = /^xmlns:?(.*)$/.exec(key);
        if (match) {
            this.xmlns[match[1]] = attrs[key];
        }
        else {
            this['$'+key] = attrs[key];        
        }
    }
}
Element.prototype.deleteFixedAttrs = function() {
    this.children && this.children.length === 0 && delete this.children;
    this.xmlns && Object.keys(this.xmlns).length === 0 && delete this.xmlns;
    delete this.nsName;
    delete this.namespace;
    delete this.name;
}
Element.prototype.allowedChildren = [];
Element.prototype.startElement= function(stack, nsName, attrs) {
    if (!this.allowedChildren) return;

    var childClass = this.allowedChildren[helper.splitNSName(nsName).name],
        element = null;

    if (childClass) {
        stack.push(new childClass(nsName, attrs));
    }
    else {
        this.unexpected(nsName);
    }

}
Element.prototype.endElement = function(stack, nsName) {    
    if (this.nsName === nsName) {
        if(stack.length < 2 ) return;
        var parent = stack[stack.length - 2];
        if (this !== stack[0]) {
            helper.extend(stack[0].xmlns, this.xmlns);
            // delete this.xmlns;
            parent.children.push(this);
            parent.addChild(this);
        }
        stack.pop();
    }
}
Element.prototype.addChild = function(child) { return; }
Element.prototype.unexpected = function(name) {
    throw new Error('Found unexpected element (' + name + ') inside ' + this.nsName);
}
Element.prototype.description = function(definitions) {
    return this.$name || this.name;
}
Element.prototype.init = function() {};
Element.createSubClass = function() {
    var root = this;
    var subElement = function() {
        root.apply(this, arguments);
        this.init();
    };
    // inherits(subElement, root);
    subElement.prototype.__proto__ = root.prototype;
    return subElement;
}


var ElementElement = Element.createSubClass();
var InputElement = Element.createSubClass();
var OutputElement = Element.createSubClass();
var SimpleTypeElement = Element.createSubClass();
var RestrictionElement = Element.createSubClass();
var EnumerationElement = Element.createSubClass();
var ComplexTypeElement = Element.createSubClass();
var SequenceElement = Element.createSubClass();
var AllElement = Element.createSubClass();
var MessageElement = Element.createSubClass();

var SchemaElement = Element.createSubClass();
var TypesElement = Element.createSubClass();
var OperationElement = Element.createSubClass();
var PortTypeElement = Element.createSubClass();
var BindingElement = Element.createSubClass();
var PortElement = Element.createSubClass();
var ServiceElement = Element.createSubClass();
var DefinitionsElement = Element.createSubClass();

var ElementTypeMap = {
    types: [TypesElement, 'schema'],
    schema: [SchemaElement, 'element complexType simpleType include import'],
    element: [ElementElement, 'annotation complexType'],
    simpleType: [SimpleTypeElement, 'restriction'],
    restriction: [RestrictionElement, 'enumeration'],
    enumeration: [EnumerationElement, ''],
    complexType: [ComplexTypeElement,  'annotation sequence all'],
    sequence: [SequenceElement, 'element'],
    all: [AllElement, 'element'],
    
    service: [ServiceElement, 'port documentation'],
    port: [PortElement, 'address'],
    binding: [BindingElement, '_binding SecuritySpec operation'],
    portType: [PortTypeElement, 'operation'],
    message: [MessageElement, 'part documentation'],
    operation: [OperationElement, 'documentation input output fault _operation'],
    input : [InputElement, 'body SecuritySpecRef documentation header'],
    output : [OutputElement, 'body SecuritySpecRef documentation header'],
    fault : [Element, '_fault'],
    definitions: [DefinitionsElement, 'types message portType binding service']
};

function mapElementTypes(types) {
    var types = types.split(' ');
    var rtn = {}
    types.forEach(function(type){
        rtn[type.replace(/^_/,'')] = (ElementTypeMap[type] || [Element]) [0];
    });
    return rtn;
}

for(var n in ElementTypeMap) {
    var v = ElementTypeMap[n];
    v[0].prototype.allowedChildren = mapElementTypes(v[1]);
}

MessageElement.prototype.init = function() {
    this.element = null;
    this.parts = null;
}
SchemaElement.prototype.init = function() { 
    this.complexTypes = {};
    this.types = {};
    this.elements = {};
    this.includes = [];
}
TypesElement.prototype.init = function() { 
    this.schemas = {};
}
OperationElement.prototype.init = function() { 
    this.input = null;
    this.output = null;
    this.inputSoap = null;
    this.outputSoap = null;
    this.style = '';
    this.soapAction = '';
}
PortTypeElement.prototype.init = function() { 
    this.methods = {};
}
BindingElement.prototype.init = function() { 
    this.transport = '';
    this.style = '';
    this.methods = {};
}
PortElement.prototype.init = function() { 
    this.location = null;
}
ServiceElement.prototype.init = function() { 
    this.ports = {};
}
DefinitionsElement.prototype.init = function() {
    if (this.name !== 'definitions') this.unexpected(nsName);
    this.messages = {};
    this.portTypes = {};
    this.bindings = {};
    this.services = {};
    this.schemas = {};
}

SchemaElement.prototype.addChild = function(child) {
    if (child.$name in Primitives) return;
    if (child.name === 'include' || child.name === 'import') {
        var location = child.$schemaLocation || child.$location;
        if (location) {
            this.includes.push({
                namespace: child.$namespace || child.$targetNamespace || this.$targetNamespace,
                location: location
            });            
        }
    }
    else if (child.name === 'complexType') {
        this.complexTypes[child.$name] = child;
    }
    else if (child.name === 'element') {
        this.elements[child.$name] = child;
    }
    else if (child.$name) {
        this.types[child.$name] = child;        
    }
    this.children.pop();
    // child.deleteFixedAttrs();
}
TypesElement.prototype.addChild = function(child) {
    assert(child instanceof SchemaElement);    
    this.schemas[child.$targetNamespace] = child;    
}
InputElement.prototype.addChild = function(child) {
    if (child.name === 'body') {
        this.use = child.$use;
        if (this.use === 'encoded') {
            this.encodingStyle = child.$encodingStyle;
        }
        this.children.pop();
    } 
}
OutputElement.prototype.addChild = function(child) {
    if (child.name === 'body') {
        this.use = child.$use;
        if (this.use === 'encoded') {
            this.encodingStyle = child.$encodingStyle;
        }
        this.children.pop();
    } 
}
OperationElement.prototype.addChild = function(child) {
    if (child.name === 'operation') {
        this.soapAction = child.$soapAction || '';
        this.style = child.$style || '';
        this.children.pop();
    }
}
BindingElement.prototype.addChild = function(child) {
    if (child.name === 'binding') {
        this.transport = child.$transport;
        this.style = child.$style;
        this.children.pop();
    }
}
PortElement.prototype.addChild = function(child) {
    if (child.name === 'address' && typeof(child.$location) !== 'undefined') {
       this.location = child.$location;
    }
}
DefinitionsElement.prototype.addChild = function(child) {
    var self = this;
    if (child instanceof TypesElement) {
        self.schemas = child.schemas;
    }
    else if (child instanceof MessageElement) {
        self.messages[child.$name] = child;
    }
    else if (child instanceof PortTypeElement) {
        self.portTypes[child.$name] = child;
    }
    else if (child instanceof BindingElement) {
        if (child.transport === 'http://schemas.xmlsoap.org/soap/http' ||
            child.transport === 'http://www.w3.org/2003/05/soap/bindings/HTTP/')
            self.bindings[child.$name] = child;
    }
    else if (child instanceof ServiceElement) {
        self.services[child.$name] = child;
    } 
    else if (child.namespace === 'wsp' && (child.name === 'Policy' || child.name === 'UsingPolicy')) {
        // This is SAP stuff, just ignore it
    } 
    else if (child.namespace === 'wsdl' && child.name === 'documentation') {
        // This is SAP stuff, just ignore it
    }
    else {
        assert(false, "Invalid child type");
    }
    this.children.pop();
}


MessageElement.prototype.postProcess = function(definitions) {
    var part = null, child,
        children = this.children || [];

    for (var i in children) {
        if ((child = children[i]).name === 'part') {
            part = child;
            break;
        }
    }
    if (!part) return;
    if (part.$element) {
        delete this.parts;
        var nsName = helper.splitNSName(part.$element);
        var ns = nsName.namespace;
        this.element = definitions.schemas[definitions.xmlns[ns]].elements[nsName.name];
        this.element.targetNSAlias = ns;
        this.element.targetNamespace = definitions.xmlns[ns];
        this.children.splice(0,1);
    }
    else {
        // rpc encoding
        this.parts = {};
        delete this.element;
        for (var i=0, part; part = this.children[i]; i++) {
            assert(part.name === 'part', 'Expected part element');
            var nsName = helper.splitNSName(part.$type);
            var ns = definitions.xmlns[nsName.namespace];
            var type = nsName.name;
            var schemaDefinition = definitions.schemas[ns];
            if (typeof schemaDefinition !== 'undefined') {
                this.parts[part.$name] = definitions.schemas[ns].types[type] || definitions.schemas[ns].complexTypes[type];
            } else {
                this.parts[part.$name] = part.$type;
            }
            this.parts[part.$name].namespace = nsName.namespace;
            this.parts[part.$name].xmlns = ns;
            this.children.splice(i--,1);
        }
    }
    this.deleteFixedAttrs();
}
OperationElement.prototype.postProcess = function(definitions, tag) {
    var children = this.children;
    for (var i=0, child; child=children[i]; i++) {
        if (child.name !== 'input' && child.name !== 'output') continue;
        if(tag === 'binding') {
            this[child.name] = child;
            children.splice(i--,1);
            continue;
        }
        var messageName = helper.splitNSName(child.$message).name;
        var message = definitions.messages[messageName]
        message.postProcess(definitions);
        if (message.element) {
            definitions.messages[message.element.$name] = message
            this[child.name] = message.element;
        }
        else {
            this[child.name] = message;
        }
        children.splice(i--,1);
    }
    this.deleteFixedAttrs();
}
PortTypeElement.prototype.postProcess = function(definitions) {
    var children = this.children;
    if (typeof children === 'undefined') return;
    for (var i=0, child; child=children[i]; i++) {
        if (child.name != 'operation') continue;
        child.postProcess(definitions, 'portType');
        this.methods[child.$name] = child;
        children.splice(i--,1);
    }
    delete this.$name;
    this.deleteFixedAttrs();
}
BindingElement.prototype.postProcess = function(definitions) {
    var type = helper.splitNSName(this.$type).name,
        portType = definitions.portTypes[type],
        style = this.style,
        children = this.children;
    
    portType.postProcess(definitions);
    this.methods = portType.methods;
    // delete portType.methods; both binding and portType should keep the same set of operations
   
    for (var i=0, child; child=children[i]; i++) {
        if (child.name != 'operation') continue;
        child.postProcess(definitions, 'binding');
        children.splice(i--,1);
        child.style || (child.style = style);
        var method =  this.methods[child.$name];
        method.style = child.style;
        method.soapAction = child.soapAction;
        method.inputSoap = child.input || null;
        method.outputSoap = child.output || null;
        method.inputSoap && method.inputSoap.deleteFixedAttrs();
        method.outputSoap && method.outputSoap.deleteFixedAttrs();
        // delete method.$name; client will use it to make right request for top element name in body
        // method.deleteFixedAttrs(); why ???
    }

    delete this.$name;
    delete this.$type;
    this.deleteFixedAttrs();    
}
ServiceElement.prototype.postProcess = function(definitions) {
    var children = this.children,
        bindings = definitions.bindings;
    for (var i=0, child; child=children[i]; i++) {
        if (child.name != 'port') continue;
        var bindingName = helper.splitNSName(child.$binding).name;
        var binding = bindings[bindingName];
        if (binding) {
            binding.postProcess(definitions);
            this.ports[child.$name] = {
                location: child.location,
                binding: binding
            }
            children.splice(i--,1);
        }
    }
    delete this.$name;
    this.deleteFixedAttrs();
}

SimpleTypeElement.prototype.description = function(definitions) {
    var children = this.children;
    for (var i=0, child; child=children[i]; i++) {
        if (child instanceof RestrictionElement)
           return this.$name+"|"+child.description();
    }
    return {};
}

RestrictionElement.prototype.description = function() {
    var base = this.$base ? this.$base+"|" : "";
    return base + this.children.map( function(child) {
       return child.description();
    } ).join(",");
}

EnumerationElement.prototype.description = function() {
   return this.$value;
}

ComplexTypeElement.prototype.description = function(definitions) {
    var children = this.children;
    for (var i=0, child; child=children[i]; i++) {
        if (child instanceof SequenceElement || 
            child instanceof AllElement) {
            return child.description(definitions);
        }
    }
    return {};
}
ElementElement.prototype.description = function(definitions) {
    var element = {},
        name = this.$name,
        schema;
    if (this.$minOccurs !== this.$maxOccurs) {
        name += '[]';
    }
    
    if (this.$type) {
        var typeName = helper.splitNSName(this.$type).name,
            ns = definitions.xmlns[helper.splitNSName(this.$type).namespace],
            schema = definitions.schemas[ns],
            typeElement = schema && ( schema.complexTypes[typeName] || schema.types[typeName] );
        if (typeElement && !(typeName in Primitives)) {
            element[name] = typeElement.description(definitions);                            
        }
        else
            element[name] = this.$type;
    }
    else {
        var children = this.children;
        element[name] = {};
        for (var i=0, child; child=children[i]; i++) {
            if (child instanceof ComplexTypeElement)
                element[name] = child.description(definitions);
        }
    }
    return element;
}
AllElement.prototype.description =
SequenceElement.prototype.description = function(definitions) {
    var children = this.children;
    var sequence = {};
    for (var i=0, child; child=children[i]; i++) {
        var description = child.description(definitions);
        for (var key in description) {
            sequence[key] = description[key];
        }
    }
    return sequence;
}
MessageElement.prototype.description = function(definitions) {
    if (this.element) {
        return this.element && this.element.description(definitions);    
    }
    var desc = {};
    desc[this.$name] = this.parts;
    return desc;
}
PortTypeElement.prototype.description = function(definitions) {
    var methods = {};
    for (var name in this.methods) {
        var method = this.methods[name];
        methods[name] = method.description(definitions);
    }
    return methods;
}
OperationElement.prototype.description = function(definitions) {
    var inputDesc = this.input.description(definitions);
    var outputDesc = this.output.description(definitions);
    return {
        input: inputDesc && inputDesc[Object.keys(inputDesc)[0]],
        output: outputDesc && outputDesc[Object.keys(outputDesc)[0]]
    }
}
BindingElement.prototype.description = function(definitions) {
    var methods = {};
    for (var name in this.methods) {
        var method = this.methods[name];
        methods[name] = method.description(definitions);
    }
    return methods;
}
ServiceElement.prototype.description = function(definitions) {
    var ports = {};
    for (var name in this.ports) {
        var port = this.ports[name];
        ports[name] = port.binding.description(definitions);
    }
    return ports;
}


exports.DefinitionsElement = DefinitionsElement;
exports.SchemaElement = SchemaElement;