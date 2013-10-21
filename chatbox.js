function Source(str) {
    this.nick = str.substring(1, str.indexOf("!"));
    this.full = str.substring(1);
}

String.prototype.hashCode = function(){
    var hash = 0;
    if (this.length == 0) return hash;
    for (i = 0; i < this.length; i++) {
        char = this.charCodeAt(i);
        hash = ((hash<<5)-hash)+char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
};

function binaryIndexOf(searchElement) {
    'use strict';

    var minIndex = 0;
    var maxIndex = this.length - 1;
    var currentIndex;
    var currentElement;
    var resultIndex;

    while (minIndex <= maxIndex) {
        resultIndex = currentIndex = ((minIndex + maxIndex) / 2) | 0;
        currentElement = this[currentIndex].nick.toLowerCase();

        if (currentElement < searchElement) {
            minIndex = currentIndex + 1;
        }
        else if (currentElement > searchElement) {
            maxIndex = currentIndex - 1;
        }
        else {
            return currentIndex;
        }
    }

    return ~maxIndex;
};

function tabComplete(e) {
    e.stopPropagation();
    console.log("Tab!");
}

// angular.module('irc', ['ui.keypress']);
var mod = angular.module('irc', []);
mod.directive('ngKeydown', function() {
    return {
        restrict: 'A',
        link: function(scope, elem, attrs) {
            var functionToCall = scope.$eval(attrs.ngKeydown);
            elem.on('keydown', functionToCall);
        }
    };
});

function TitleCtrl($scope) {
    $scope.channel = "#channel";
    $scope.socket = new WebSocket("ws://localhost:8080", ["binary"]);
    $scope.socket.binaryType = "arraybuffer";

    $scope.sendRaw = function(/* *arguments */) {
        var sep = " ";
        var text = $.makeArray(arguments).join(sep) + "\r\n";
        $scope.socket.send(text);
    };

    $scope.sendPrivmsg = function(target, message) {
        $scope.sendRaw("PRIVMSG", target, ":" + message);
    };

    $scope.sendJoin = function(channel) {
        $scope.sendRaw("JOIN", channel);
        $scope.channel = channel  // TODO: bad, but for testing.
    };

    $scope.sendNick = function(nick) {
        $scope.sendRaw("NICK", nick);
    };

    $scope.sendMe = function(target, message) {
        $scope.sendPrivmsg(target, "\x01ACTION" + message + "\x01");
    };

    $scope.sendQuit = function(reason) {
        $scope.sendRaw("QUIT", ":" + reason);
    };

    $scope.sendPart = function(channel, reason) {
        $scope.sendRaw("PART", channel, ":" + reason);
    };
}

function IrcCtrl($scope) {
    $scope.msgs = [];
    $scope.channelgoers = [[], [], []];
    $scope.showTimestamp = true;
    $scope.nick = "Interloper";
    $scope.buffer = "";

    $scope.$parent.socket.onopen = function() {
        var realname = "Major Look";
        console.log("Socket opened");
        $scope.$parent.sendNick($scope.nick);
        $scope.$parent.sendRaw("USER", $scope.nick, "0 * :" + realname);
        $scope.$parent.sendJoin("#orez-angular");
        $scope.$apply();
    };

    $scope.$parent.socket.onmessage = function(msg) {
        var decoded = "";
        var line;
        var nextEOL = 0;
        var unitArr = new Uint8Array(msg.data);
        for (var i=0; i < unitArr.byteLength; i++) {
            decoded += String.fromCharCode(unitArr[i])
        }   // decode the binary data
        $scope.buffer += decoded;
        nextEOL = $scope.buffer.indexOf("\n");
        while(~nextEOL) {
            line = $scope.buffer.substring(0, nextEOL);
            $scope.buffer = $scope.buffer.substring(nextEOL + 1);
            $scope.handleRecv(line);
            nextEOL = $scope.buffer.indexOf("\n");
        }
        $scope.$apply();
    };

    $scope.$parent.socket.onclose = function() {
        console.log("Socket closed");
        // $scope.$apply();
    };

    $scope.onprivmsg = function(words) {
        /* source, PRIVMSG, target, *message */
        var message = words.slice(3).join(" ").substring(1);
        if(message.lastIndexOf("\x01ACTION", 0) === 0) { // /me
            $scope.addMe(words[0].nick, message.slice(7, -1));
        }
        else
            $scope.addMessage(words[0].nick, message);
    };

    $scope.onnick = function(words) {
        /* source, NICK, ':'new_nick */
        // TODO: only do this if he's in your channel
        var new_nick = words[2].substring(1);
        var old_nick = words[0].nick;
        var person = $scope.removePerson(old_nick);
        $scope.addPerson(new_nick, person.hat);
        if(old_nick.toLowerCase() == $scope.nick.toLowerCase())
            $scope.nick = new_nick;
        $scope.addSysmsg(old_nick + " is now known as " + new_nick);
    };

    $scope.onquit = function(words) {
        /* source, QUIT, ':'*reason */
        var message = words.slice(2).join(" ").substring(1);
        $scope.removePerson(words[0].nick);
        $scope.addSysmsg(words[0].nick + " has quit: \"" + message + "\"");
    };

    $scope.onpart = function(words) {
        /* source, PART, channel, ':'*reason */
        if(words[2] == $scope.$parent.channel) {  // only note if it's THIS channel
            var message = words.slice(3).join(" ").substring(1);
            $scope.removePerson(words[0].nick);
            $scope.addSysmsg(words[0].nick + " has left the channel: " + message);
        }
    };

    $scope.onjoin = function(words) {
        /* source, JOIN, channel */
        if(words[2] == $scope.$parent.channel) {  // only note if it's THIS channel
            $scope.addPerson(words[0].nick, 0);
            $scope.addSysmsg(words[0].nick + " [" + words[0].full + "] entered the room.");
        }
    };

    $scope.on353 = function(words) {
        /* source, 353, mynick, '@', channel, ':'*nicks */
        var nicks = words.slice(5);
        nicks[0] = nicks[0].substring(1);  // cut the leading ':'
        $scope.channelgoers = [[], [], []];  // clear the channel
        var hat, hat_value;
        for(var i = 0; i < nicks.length; i++) {
            hat = nicks[i].charAt(0);
            hat_value = 0;
            if(hat == "@" || hat == "+") {
                nicks[i] = nicks[i].slice(1);  // TODO: add more handling
                hat_value = "+@".indexOf(hat) + 1;
            }
            $scope.addPerson(nicks[i], hat_value);
        }
    };

    $scope.incoming_commands = {
        PRIVMSG: $scope.onprivmsg,
        QUIT: $scope.onquit,
        PART: $scope.onpart,
        JOIN: $scope.onjoin,
        NICK: $scope.onnick,
        "353": $scope.on353
    };

    $scope.handleRecv = function(message) {
        words = message.replace(/[\r\n]$/g, "").split(" ");
        if (words[0] == "PING")
            $scope.sendRaw("PONG", words[1]);
        else {
            if (words[1] in $scope.incoming_commands) {
                words[0] = new Source(words[0]);
                $scope.incoming_commands[words[1]](words);
            }
            else
                console.log(message);
        }
    };

    $scope.tabComplete = function(e) {
        if (e.which != 9) return;  // only capture tabs
        e.preventDefault();
        console.log("Tab!");
        var index = $scope.messageInput.lastIndexOf(" ") + 1;
        var extra = " ";
        if(index == 0) {
            if(!$scope.messageInput) return;
            extra = ", ";
            index = 0;
        }
        var prefix = $scope.messageInput.substring(index).toLowerCase();  // last word
        var matches = [];
        var curList;
        var lIndex;
        if(prefix == "") return;
        for(var i = 0; i < $scope.channelgoers.length; i++) {
            curList = $scope.channelgoers[i];
            lIndex = binaryIndexOf.call(curList, prefix);  // get the start of these guys
            // console.log("Looking for lIndex);
            if(lIndex < 0) lIndex = ~lIndex + 1;
            for(; lIndex < curList.length && curList[lIndex].nick.toLowerCase().lastIndexOf(prefix, 0) === 0; lIndex++)
                matches.push(curList[lIndex].nick);
        }  // now we have all the users who match
        if(matches.length == 0) return;  // no matches
        // find the longest match common to all
        var common = matches[0];
        var max;
        for(var i = 1; i < matches.length; i++) {
            max = Math.max(matches[i].length, common.length);
            for(var j = 0; j < max; j++) {
                if(matches[i].charAt(j).toLowerCase() != common.charAt(j).toLowerCase()) {
                    common = common.substring(0, j);
                    break;
                }
            }
        }
        $scope.messageInput = $scope.messageInput.substring(0, index) + common + extra;
        $scope.$apply();
    };

    $scope.injectPersonStyle = function(nick) {
        var cls = (".user-" + nick);
        var color = Math.abs(nick.hashCode() % 16777216).toString(16);
        while (color.length < 6) {  // zerofill
            color = "0" + color;
        }
        var style = {};
        style[cls] = {color: '#' + color};
        jQuery.injectCSS(style);
    };

    $scope.addPerson = function(nick, hat) {
        $scope.injectPersonStyle(nick);
        var index = ~binaryIndexOf.call($scope.channelgoers[hat], nick.toLowerCase()) + 1;
        var person = {
            nick: nick,
            hat: hat,
            op: function() {this.hat == 2},
            voice: function() {this.hat == 1}
        };
        $scope.channelgoers[hat].splice(index, 0, person);  // insert
    };

    $scope.removePerson = function(nick) {
        var index;
        for(var i = 0; i < $scope.channelgoers.length; i++) {
            index = binaryIndexOf.call($scope.channelgoers[i], nick.toLowerCase());
            if(index >= 0) { // found
                var obj = $scope.channelgoers[i][index];
                $scope.channelgoers.splice(index, 1);  // remove
                return obj;
            }
        }
        return false;
    };

    $scope.addMessage = function(sender, msg) {
        var message = {
            msg: msg,
            sender: sender,
            timestamp: new Date(),
            showTimestamp: true
        }
        $scope.msgs.push(message);
    };

    $scope.addMe = function(sender, msg) {
        var message = {
            msg: msg,
            sender: sender,
            timestamp: new Date(),
            me: true,
            showTimestamp: true
        }
        $scope.msgs.push(message);
    };

    $scope.addSysmsg = function(msg, suppressTimestamp) {
        var message = {
            msg: msg,
            sender: ":",
            sysmsg: true,
            timestamp: new Date(),
            showTimestamp: !suppressTimestamp
        };
        $scope.msgs.push(message);
    };

    $scope.handleCommand = function(message) {
        var words = message.split(/\s+/);
        var msg = message.substring(message.indexOf(" ") + 1);
        if(words[0] == "/join") {
            $scope.$parent.sendJoin(words[1]);
        }
        else if(words[0] == "/raw") {
            $scope.$parent.sendRaw(msg);
        }
        else if(words[0] == "/quit") {
            $scope.$parent.sendQuit(msg);
        }
        else if(words[0] == "/part") {
            var chan = $scope.$parent.channel;
            $scope.$parent.sendPart(chan, msg);
        }
        else if(words[0] == "/cycle") {
            var chan = $scope.$parent.channel;
            $scope.$parent.sendPart(chan, msg);
            $scope.$parent.sendJoin(chan);
        }
        else if(words[0] == "/me") {
            $scope.$parent.sendMe($scope.$parent.channel, msg);
            $scope.addMe($scope.nick, msg);
        }
        else if(words[0] == "/nick") {
            $scope.$parent.sendNick(words[1]);
        }
        else if(words[0] == "/clear") {
            $scope.msgs = [];
        }
        else {
            $scope.addSysmsg("Unknown command " + words[0], true);
        }
    };

    $scope.sendMessage = function() {
        var message = $scope.messageInput;
        if(!message)  return;
        if(message.charAt(0) == "/")
            $scope.handleCommand(message);
        else {
            $scope.addMessage($scope.nick, message);
            $scope.$parent.sendPrivmsg($scope.$parent.channel, message);
        }
        $scope.messageInput = "";
        $('.btn.nick').popover({
          html: true,
          content: "/whois info goes here",
          trigger: 'hover'
          }).click(function(e) {
              $(this).popover('toggle');
              e.stopPropagation();
          });
    };

    $scope.toggleTimestamp = function() {
        $scope.showTimestamp = !$scope.showTimestamp;
    };
};
