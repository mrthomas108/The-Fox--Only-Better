moduleAid.VERSION = '1.0.0';

// don't forget to change this for each add-on! See http://www.famkruithof.net/uuid/uuidgen
this.addonUUID = '9cb2c7a0-5224-11e4-916c-0800200c9a66';

this.whatsNewLastVersion = null;
this.changelog = '';

this.__defineGetter__('whatsNewURL', function() { return 'chrome://'+objPathString+'/content/whatsnew.xhtml'; });
this.__defineGetter__('whatsNewAbout', function() { return 'about:'+objPathString; });

this.whatsNewAboutAddons = function() {
	window.BrowserOpenAddonsMgr();
};

this.whatsNewChangeLog = function(m) {
	if(whatsNewLastVersion) {
		messenger.messageBrowser(m.target, 'notifyLastVersion', whatsNewLastVersion);
		whatsNewLastVersion = null;
	}
	
	if(changelog) {
		messenger.messageBrowser(m.target, 'changeLog', changelog);
		return;
	}
	
	xmlHttpRequest('resource://'+objPathString+'/changelog.json', function(xmlhttp) {
		if(xmlhttp.readyState == 4) {
			changelog = xmlhttp.responseText;
			whatsNewChangeLog(m);
		}
	});
};

this.whatsNewNotifyOnUpdates = function(m) {
	prefAid.notifyOnUpdates = m.data;
};

// we have to wait for Session Store to finish, otherwise our tab will be overriden by a session-restored tab
this.whatsNewOpenWhenReady = function() {
	if(typeof(whatsNewOpenWhenReady) == 'undefined') { return; }
	
	var state = JSON.parse(window.SessionStore.getBrowserState());
	// we're in a window, so "a" window should exist...
	if(state.windows.length == 0) {
		aSync(whatsNewOpenWhenReady, 500);
		return;
	}
	
	window.gBrowser.selectedTab = window.gBrowser.addTab(whatsNewAbout);
	window.gBrowser.selectedTab.loadOnStartup = true; // for Tab Mix Plus
};

moduleAid.LOADMODULE = function() {
	// register our about: page, only do it once per session
	if(!Globals.aboutWhatsNew) {
		try {
			Globals.aboutWhatsNew = {
				manager: Cm.QueryInterface(Ci.nsIComponentRegistrar),
				
				handler: {
					uri: Services.io.newURI('chrome://'+objPathString+'/content/whatsnew.xhtml', null, null),
					classDescription: 'about: handler for add-on '+objName,
					classID: Components.ID(addonUUID),
					contractID: '@mozilla.org/network/protocol/about;1?what='+objPathString,
					QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),
					newChannel: function(aURI) {
						let chan = Services.io.newChannelFromURI(this.uri);
						chan.originalURI = aURI;
						return chan;
					},
					getURIFlags: function(aURI) 0
				},
				
				load: function() {
					this.manager.registerFactory(this.handler.classID, this.handler.classDescription, this.handler.contractID, this);
				},
				
				unload: function() {
					this.manager.unregisterFactory(this.handler.classID, this);
				},
				
				createInstance: function(outer, iid) {
					if(outer) {
						throw Cr.NS_ERROR_NO_AGGREGATION;
					}
					return this.handler;
				}
			};
			
			Globals.aboutWhatsNew.load();
		} catch(ex) {
			Cu.reportError('failed to register module: ' + cls.name + '\nexception thrown: ' + ex);
		}
	}
	
	messenger.loadInWindow(window, 'whatsNew');
	
	messenger.listenWindow(window, 'aboutAddons', whatsNewAboutAddons);
	messenger.listenWindow(window, 'changeLog', whatsNewChangeLog);
	messenger.listenWindow(window, 'addonOptions', doOpenOptions);
	messenger.listenWindow(window, 'notifyOnUpdates', whatsNewNotifyOnUpdates);
	
	// if we're in a dev version, ignore all this
	if(AddonData.version.contains('a') || AddonData.version.contains('b')) { return; }
	
	// if we're updating from a version without this module, try to figure out the last version
	if(prefAid.lastVersionNotify == '0' && STARTED == ADDON_UPGRADE && AddonData.oldVersion) {
		prefAid.lastVersionNotify = AddonData.oldVersion;
	}
	
	// now make sure we notify the user when updating only, when installing for the first time do nothing
	if(prefAid.notifyOnUpdates && prefAid.lastVersionNotify != '0' && Services.vc.compare(prefAid.lastVersionNotify, AddonData.version) < 0) {
		whatsNewLastVersion = prefAid.lastVersionNotify;
		whatsNewOpenWhenReady();
	}
	
	// always set the pref to the current version, this also ensures only one notification tab will open per firefox session (and not one per window)
	if(prefAid.lastVersionNotify != AddonData.version) {
		prefAid.lastVersionNotify = AddonData.version;
	}
};

moduleAid.UNLOADMODULE = function() {
	messenger.unloadFromWindow(window, 'whatsNew');
	
	messenger.unlistenWindow(window, 'aboutAddons', whatsNewAboutAddons);
	messenger.unlistenWindow(window, 'changeLog', whatsNewChangeLog);
	messenger.unlistenWindow(window, 'addonOptions', doOpenOptions);
	messenger.unlistenWindow(window, 'notifyOnUpdates', whatsNewNotifyOnUpdates);
	
	for(var tab of window.gBrowser.mTabs) {
		if(tab.linkedBrowser.currentURI.spec.startsWith(whatsNewURL) || tab.linkedBrowser.currentURI.spec.startsWith(whatsNewAbout)) {
			window.gBrowser.removeTab(tab);
		}
	}
	
	if(UNLOADED && Globals.aboutWhatsNew) {
		Globals.aboutWhatsNew.unload();
		delete Globals.aboutWhatsNew;
	}
};
