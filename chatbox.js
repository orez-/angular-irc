function Source(str) {
    this.nick = str.substring(1, str.indexOf("!"));  // wrong for servers
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
    return ~(maxIndex + 1);
};

var mod = angular.module('irc', ["ui.bootstrap"]);
mod.directive('ngKeydown', function() {
    return {
        restrict: 'A',
        link: function(scope, elem, attrs) {
            var functionToCall = scope.$eval(attrs.ngKeydown);
            elem.on('keydown', functionToCall);
        }
    };
});

mod.directive('uiBlur', function() {
    return function(scope, elem, attrs) {
        elem.bind('blur', function() {
            console.log("Blurring");
            scope.$apply(attrs.uiBlur);
        });
    };
});

mod.directive('focusWhen', function($timeout) {
    return function(scope, element, attrs) {
        scope.$watch(attrs.focusWhen, function(value) {
            if(value === true) {
                $timeout(function() {
                    element[0].focus();
                });
            }
        });
    };
});

function IrcCtrl($scope) {
    // ================
    // This stuff should be in its own Controller. It doesn't work when it is.
    $scope.inputOpen = false;
    $scope.channelName = "";

    $scope.openInput = function($event) {
        console.log("Opening input (on click)");
        $event.stopPropagation();
        if(!$scope.inputOpen) {
            $scope.inputOpen = true;
            $scope.channelName = "";
        }
    };

    $scope.closeInput = function() {
        $scope.inputOpen = false;
    };

    $scope.queryTarget = function(target) {
        if(target) {  // input is not empty
            var targetChan = getChannel(target);
            if(targetChan) {  // already exists
                setAllInactive();
                targetChan.active = true;
            }
            else {
                if(target.charAt(0) == "#") {  // channel
                    $scope.sendJoin(target);
                }
                else {
                    $scope.addPM(target);
                }
            }
        }
        $scope.inputOpen = false;
    };

    // ==================

    $scope.channels = [];
    $scope.socket = new WebSocket("ws://localhost:8080", ["binary"]);
    $scope.socket.binaryType = "arraybuffer";
    $scope.buffer = "";
    $scope.nick = "Interloper";

    $scope.addStatusTab = function() {
        $scope.channels.push({
            name: "-- Status --",
            channel: false,
            active: true,
            status: true
        });
    };
    $scope.addStatusTab();

    var setAllInactive = function() {
        angular.forEach($scope.channels, function(channel) {
            channel.active = false;
        });
    };

    var addNewChannel = function(channel) {
        $scope.channels.push({
            name: channel,
            channel: true,
            active: true,
            status: false
        });
    };

    var addNewPM = function(nick) {
        $scope.channels.push({
            name: nick,
            channel: false,
            active: true,  // TODO: maybe not
            status: false
        });
    }

    var getChannel = function(channel) {
        lowerChannel = channel.toLowerCase();
        for(var i = 0; i < $scope.channels.length; i++)
            if ($scope.channels[i].name.toLowerCase() == lowerChannel) {
                if ($scope.channels[i].name != channel)
                    $scope.channels[i].name = channel;
                return $scope.channels[i];
            }
        return false;
    }

    var getChannelScope = function(channel) {
        var toR = getChannel(channel);
        return (toR && toR.scope);
    }

    $scope.addChannel = function(channel) {
        if($scope.channels[0].status) {
            $scope.channels = [];
        }
        setAllInactive();
        addNewChannel(channel);
    };

    $scope.addPM = function(nick) {
        if($scope.channels[0].status) {
            $scope.channels = [];
        }
        setAllInactive();
        addNewPM(nick);
    }

    $scope.removeChannel = function(channel) {
        for(var i = 0; i < $scope.channels.length; i++) {
            if($scope.channels[i].name == channel) {
                if($scope.channels[i].status) return false;
                var chan = $scope.channels[i];
                $scope.channels.splice(i, 1);
                setAllInactive();
                if(i >= $scope.channels.length) i--;
                if(i == -1) {
                    $scope.addStatusTab();
                    i = 0;
                }
                $scope.channels[i].active = true;
                return chan;
            }
        }
        return false;
    };

    $scope.tabClick = function($event, channel) {
        if($event.which == 2) {  // middle click
            $event.stopPropagation();
            if (channel.status) return false; // can't close the status channel
            if (channel.channel) {  // is a channel
                $scope.sendPart(channel.name, "Tab closed");
            }
            else {  // is a PM
                $scope.removeChannel(channel.name);
            }
        }
    };

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
        $scope.addChannel(channel);
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
        if(channel.charAt(0) != "#") {  // make sure it's a channel
            return false;
        }
        var target = $scope.removeChannel(channel);
        if(target)
            $scope.sendRaw("PART", channel, ":" + reason);
    };

    $scope.socket.onopen = function() {
        var realname = "Major Look";
        console.log("Socket opened");
        $scope.sendNick($scope.nick);
        $scope.sendRaw("USER", $scope.nick, "0 * :" + realname);
        $scope.$apply();
    };

    $scope.socket.onmessage = function(msg) {
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

    $scope.socket.onclose = function() {
        console.log("Socket closed");
        // $scope.$apply();
    };

    $scope.onprivmsg = function(words) {
        /* source, PRIVMSG, target, *message */
        var message = words.slice(3).join(" ").substring(1);
        var targetName;
        var target;
        var openFn;
        if(words[2] == $scope.nick) {  // PM
            targetName = words[0].nick;  // sender
            openFn = $scope.addPM;
        }
        else {  // channel
            targetName = words[2];  // channel
            openFn = $scope.addChannel;
        }
        target = getChannelScope(targetName);
        if(!target) {  // window isn't open yet
            openFn(targetName);
            $scope.$apply();
            target = $scope.channels[$scope.channels.length - 1].scope;
        }
        if(message.lastIndexOf("\x01ACTION", 0) === 0) { // /me
            target.addMe(words[0].nick, message.slice(7, -1));
        }
        else
            target.addMessage(words[0].nick, message);
    };

    $scope.onnotice = function(words) {
        /* source, NOTICE, mynick, ':'Notice */
        var notice = words.slice(3).join(" ").substring(1);
        angular.forEach($scope.channels, function(channel) {
            channel.scope.addNotice(words[0].nick, notice);
        });
    };

    $scope.onnick = function(words) {
        /* source, NICK, ':'new_nick */
        var new_nick = words[2].substring(1);
        var old_nick = words[0].nick;
        var lowerOldNick = old_nick.toLowerCase();
        if(lowerOldNick == $scope.nick.toLowerCase())  // that's my nick
            $scope.nick = new_nick;
        angular.forEach($scope.channels, function (channel) {
            if(channel.channel) {
                var target = channel.scope;
                var person = target.removePerson(old_nick);
                if(person) {
                    target.addPerson(new_nick, person.hat);
                    target.addSysmsg(old_nick + " is now known as " + new_nick);
                }
            }
            else {
                if(channel.name.toLowerCase() == lowerOldNick) {
                    channel.name = new_nick;
                    // TODO: merge if there's any more tabs named new_nick
                    channel.scope.addSysmsg(old_nick + " is now known as " + new_nick);
                }
            }
        });
    };

    $scope.onquit = function(words) {
        /* source, QUIT, ':'*reason */
        var message = words.slice(2).join(" ").substring(1);
        angular.forEach($scope.channels, function (channel) {
            var target = channel.scope;
            if (target.removePerson(words[0].nick))
                target.addSysmsg(words[0].nick + " has quit: \"" + message + "\"");
        });
    };

    $scope.onpart = function(words) {
        /* source, PART, channel, ':'*reason */
        var target = getChannelScope(words[2]);
        var message = words.slice(3).join(" ").substring(1);
        if(target) {
            target.removePerson(words[0].nick);
            target.addSysmsg(words[0].nick + " has left the channel: " + message);
        }
    };

    $scope.onjoin = function(words) {
        /* source, JOIN, channel */
        var target = getChannelScope(words[2]);
        if (target) {
            target.addPerson(words[0].nick, 0);
            target.addSysmsg(words[0].nick + " [" + words[0].full + "] entered the room.");
        }
    };

    /* The topic of the channel given. */
    $scope.on332 = function(words) {
        /* source, 332, mynick, channel, ':'*topic */
        words[5] = words[5].substring(1);  // cut leading ':'
        var topic = words.slice(5).join(" ");
        var target = getChannelScope(words[3]);
        target.setTopic(topic);
    };

    /* The person who set the topic. */
    $scope.on333 = function(words) {
        /* source, 333, mynick, channel, setter_source */
        var setter = new Source(words[4]);
        var target = getChannelScope(words[3]);
        target.topic.setter = setter;
    };

    /* The people in the channel given. */
    $scope.on353 = function(words) {
        /* source, 353, mynick, '@', channel, ':'*nicks */
        var nicks = words.slice(5);
        var target = getChannelScope(words[4]);
        if(target) {
            nicks[0] = nicks[0].substring(1);  // cut the leading ':'
            target.channelgoers = [[], [], []];  // clear the channel
            var hat, hat_value;
            for(var i = 0; i < nicks.length; i++) {
                hat = nicks[i].charAt(0);
                hat_value = 0;
                if(hat == "@" || hat == "+") {
                    nicks[i] = nicks[i].slice(1);
                    hat_value = "+@".indexOf(hat) + 1;
                }
                target.addPerson(nicks[i], hat_value);
            }
        }
    };

    /* No such nick or channel */
    $scope.on401 = function(words) {
        /* source 401 mynick attempted_dest :No such nick/channel */
    }

    /* No such channel */
    $scope.on403 = function(words) {
    }

    /* Cannot send */
    $scope.on404 = function(words) {
        /* source 404 mynick channel ':Cannot send to channel' */
        var target = getChannelScope(words[3]);
        for(var i = target.msgs.length - 1; i >= 0; i--) {
            if(target.msgs[i].nick == $scope.nick) {  // find the last message by you
                target.msgs.splice(i, 1);  // remove that message
                return true;
            }
        }
        return false;
    }

    $scope.incoming_commands = {
        PRIVMSG: $scope.onprivmsg,
        NOTICE: $scope.onnotice,
        QUIT: $scope.onquit,
        PART: $scope.onpart,
        JOIN: $scope.onjoin,
        NICK: $scope.onnick,
        "332": $scope.on332,
        "333": $scope.on333,
        "353": $scope.on353,
        "404": $scope.on404
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
}

function ChannelCtrl($scope) {
    $scope.msgs = [];
    $scope.channelgoers = [[], [], []];
    $scope.showTimestamp = true;
    $scope.topic = {topic: null, setter: null};

    $scope.init = function(channel) {
        channel.scope = $scope;
        $scope.channel = channel;
    }

    $scope.tabComplete = function(e) {
        if (e.which != 9) return;  // only capture tabs
        e.preventDefault();
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
            if(lIndex < 0) lIndex = ~lIndex;
            for(; lIndex < curList.length && curList[lIndex].nick.toLowerCase().lastIndexOf(prefix, 0) === 0; lIndex++)
                matches.push(curList[lIndex].nick);
        }  // now we have all the users who match
        if(matches.length == 0) return;  // no matches
        // find the longest match common to all
        var common = matches[0];
        var max;
        for(var i = 1; i < matches.length; i++) {
            extra = "";
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

    $scope.setTopic = function(topic) {
        $scope.topic.topic = topic;
    }

    $scope.addPerson = function(nick, hat) {
        $scope.injectPersonStyle(nick);
        var index = ~binaryIndexOf.call($scope.channelgoers[hat], nick.toLowerCase());
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
                $scope.channelgoers[i].splice(index, 1);  // remove
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
        };
        $scope.msgs.push(message);
    };

    $scope.addMe = function(sender, msg) {
        var message = {
            msg: msg,
            sender: sender,
            timestamp: new Date(),
            me: true,
            showTimestamp: true
        };
        $scope.msgs.push(message);
    };

    $scope.addNotice = function(sender, msg) {
        var message = {
            msg: "NOTICE: " + msg,
            sender: sender,
            timestamp: new Date(),
            showTimestamp: true
            // TODO: distinguish notices better
        };
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

    $scope.outgoing_commands = {
        "/join": function(words, msg) {$scope.$parent.sendJoin(words[1]);},
        "/raw": function(words, msg) {$scope.$parent.sendRaw(msg);},
        "/quit": function(words, msg) {$scope.$parent.sendQuit(msg);},
        "/part": function(words, msg) {
            var channelName = $scope.channel.name;
            msg = words.slice(2).join(" ");
            if(words[1]) {
                channelName = words[1];
            }
            if(!$scope.$parent.sendPart(channelName, msg)) { // failed
                $scope.addSysmsg("No such channel: " + channelName, true);
            }
        },
        "/cycle": function(words, msg) {
            var chan = $scope.channel.name;
            $scope.$parent.sendPart(chan, msg);
            $scope.$parent.sendJoin(chan);
        },
        "/me": function(words, msg) {
            $scope.$parent.sendMe($scope.channel.name, msg);
            $scope.addMe($scope.nick, msg);
        },
        "/nick": function(words, msg) {$scope.$parent.sendNick(words[1]);},
        "/clear": function(words, msg) {$scope.msgs = [];},
        "/query": function(words, msg) {$scope.$parent.queryTarget(words[1]);}
    }

    $scope.handleCommand = function(message) {
        var words = message.split(/\s+/);
        var msg = message.substring(message.indexOf(" ") + 1);
        if(words[0] in $scope.outgoing_commands)
            return $scope.outgoing_commands[words[0]](words, msg);
        $scope.addSysmsg("Unknown command " + words[0], true);
    };

    $scope.sendMessage = function() {
        var message = $scope.messageInput;
        if(!message)  return;
        if(message.charAt(0) == "/")
            $scope.handleCommand(message);
        else {
            $scope.addMessage($scope.nick, message);
            $scope.$parent.sendPrivmsg($scope.channel.name, message);
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
