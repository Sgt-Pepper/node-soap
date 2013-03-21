var url = 'http://webservices.daehosting.com/services/isbnservice.wso?WSDL';
var soap = require('../..');

var args = {sISBN: '978-3608938289'};


//calls the isbn checker webservice, and see if lord of the rings has a valid number
soap.createClient(url, function(err, client) {
console.log(client.describe())
	client.IsValidISBN13(args,function(err,res,raw){
		if(res. IsValidISBN13Result) console.log('test ok');
		else console.log('test failed');
	})

});