'use strict'; //eslint-disable-line strict
const extend = require('lodash').extend;

const debug = require('debug')('screens:screens');

let app;

function socketsForIDs(ids) {
	const clients = app.io.of('/screens').connected;
	return Object.keys(clients).filter(function(sockID) {
		return (clients[sockID].data && (!ids || !ids.length || ids.indexOf(clients[sockID].data.id) !== -1));
	}).map(function(sockID) {
		return clients[sockID];
	});
}

function syncDown(sock) {
	sock.emit('update', sock.data);

	// Tell all admin users about the update
	generateAdminUpdate(sock).then(function(data) {
		app.io.of('/admins').emit('screenData', data);
	});
}

function generateAdminUpdate(sock) {
	return app.hbs.render('views/screen.handlebars', sock.data).then(function(content) {
		return {
			id: sock.data.id,
			content: content
		};
	});
}

module.exports.setApp = function(_app) {
	app = _app;
};

module.exports.add = function(socket) {

	// Store metadata against the socket.
	// While we're using the socket list as a data store, all sockets are
	// considered online, because we'll forget about them as soon as they disconnect.
	socket.data = {
		id: null,
		items: []
	};
	debug('New screen connected on socket '+socket.id);

	// Request registration on connect so that registration is done on reconnects as well as the initial connect
	socket.emit('requestUpdate');

	socket.on('update', function(data) {

		// If screen has not cited a specific ID, assign one
		if (!data.id || !parseInt(data.id, 10)) {
			data.id = Math.random() * 99999 | 0;
		}
		data.id = parseInt(data.id, 10);

		if (!socket.data.id) {
			debug('New screen on socket '+socket.id+' now identifies as '+data.id+' ('+data.name+')');
		}

		// Record the updated data against the socket
		extend(socket.data, data);

		syncDown(socket);

	});

	socket.on('disconnect', function() {
		debug('Screen disconnected: '+this.data.id+ ' from socket '+this.id);
		app.io.of('/admins').emit('screenData', { id: this.data.id });
	});
};

module.exports.set = function(ids, data) {
	data = data || {};
	socketsForIDs(ids).forEach(function(sock) {
		extend(sock.data, data);
		syncDown(sock);
	});
};

module.exports.get = function(ids) {
	return socketsForIDs(ids).map(function(sock) {
		return sock.data;
	});
};

module.exports.pushItem = function(ids, item) {
	socketsForIDs(ids).forEach(function(sock) {
		sock.data.items.push(item);
		syncDown(sock);
	});
};

module.exports.removeItem = function(id, idx) {
	const sock = socketsForIDs([parseInt(id, 10)])[0];
	if (sock) {
		sock.data.items.splice(idx, 1);
		syncDown(sock);
	}
};

module.exports.clearItems = function(ids) {
	socketsForIDs(ids).forEach(function(sock) {
		sock.data.items = [];
		syncDown(sock);
	});
};

module.exports.generateAdminUpdate = function(ids) {
	return Promise.all(socketsForIDs(ids).map(generateAdminUpdate));
};

module.exports.reload = function(ids){

	if(ids === undefined){
		app.io.of('/screens').emit('reload');
	} else {
		socketsForIDs(ids).map(function(socket){
			socket.emit('reload');
		})
	}



};
