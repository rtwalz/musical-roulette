let token = null
if (!location.hash) {
	location.href = "/"
} else {
	token = location.hash.split("#")[1].split("=")[1].split("&")[0]
}
if (!token) {
	location.href = "/"
}

var ID = function () {
  return '_' + Math.random().toString(36).substr(2, 9);
};

let uniqueId = localStorage.getItem("uuid")
if (!uniqueId) {
	uniqueId = ID()
	localStorage.setItem("uuid", uniqueId)
}

var socket = io();
let playerCount = 0
let gameCode = null
let isHostG = false
let questionStartTime = null

socket.on('playerlist', function(msg) {
	byId("playerListContainer").innerHTML = ""
	playerCount = msg.length
    msg.forEach(function(player){
    	var item = document.createElement('div');
	    item.textContent = player;
	    item.classList.add("player")
	    
	    byId("playerListContainer").appendChild(item);
    })
    hideEverything()
    byId("lobby").classList.remove("hidden")
  });

socket.on("error", function(msg){
	alert(msg)
	location.reload()
})

socket.on('question', function(msg) {



	questionStartTime = new Date().getTime()
	function animationFrame(){
		let msPassed = new Date().getTime() - questionStartTime
		let percentageCalc = 1-(msPassed/msg.ms)
		byId("countdown").style.width = percentageCalc*100 + "%"
		if (percentageCalc <= 1 ) {
			window.requestAnimationFrame(animationFrame);
		}
	}
	window.requestAnimationFrame(animationFrame);
	if (isHostG) {
		let blankAudio = new Audio(msg.mp3)
		blankAudio.play()
		setTimeout(function(){
			blankAudio.pause()
		}, 21000)
	}
	byId("questionBank").innerHTML = ""
	playerCount = msg.players.length
	let ifPickedAnswerAlready = false
    msg.players.forEach(function(player){
    	var item = document.createElement('button');
	    item.textContent = player.name;
	    item.classList.add("songAnswer")
	    item.setAttribute("_player", player.internalId)

	    item.onclick = function(){
	    	alert("hi")
	    	if (!ifPickedAnswerAlready){
	    		ifPickedAnswerAlready = true
	    		console.log("picked", player.internalId, msg.owner, msg)
	    		

	    		socket.emit('answer', {
					gamecode: msg.gameId,
					pick: player.internalId,
					id: uniqueId,
					correct: player.internalId == msg.owner,
					ms: new Date().getTime() - questionStartTime
				});
	    	}
	    }
	    
	    byId("questionBank").appendChild(item);
    })
    hideEverything()
    byId("question").classList.remove("hidden")
  });

function hideEverything(){
	byId("dash").classList.add("hidden")
	byId("result").classList.add("hidden")
	byId("lobby").classList.add("hidden")
	byId("question").classList.add("hidden")
	byId("joingame").classList.add("hidden")
	byId("getgamecode").classList.add("hidden")
}


let byId = function(si){
	return document.getElementById(si)
}
byId("join").addEventListener('click', function() { 
	byId("dash").classList.add("hidden")
	byId("joingame").classList.remove("hidden")
}, false);

byId("create").addEventListener('click', function() { 
	byId("dash").classList.add("hidden")
	byId("getgamecode").classList.remove("hidden")
}, false);

function joinGame(gamecode, name, isHost){
	isHostG = isHost
	getSongs(token, function(songs){
		socket.emit('initial', {
			name: name,
			songs: songs,
			gamecode: gamecode,
			id: uniqueId
		});
		byId("gamecodeDisplay").innerHTML = gamecode
		if (isHost) byId("startgameHost").classList.remove("hidden")
		gameCode = gamecode
	})
}

byId("startgameHost").addEventListener('click', function() { 
	if (playerCount < 2) return alert("You need at least 2 people to start the game!")
		socket.emit('start', gameCode);
}, false);

byId("gamecode").addEventListener('click', function() { 
	let name = byId("createName").value
	if (!name) return alert("Enter your name!!!!")
	fetch('/newgame')
	  .then(response => response.json())
	  .then(data => joinGame(data.code, name, true));
}, false);

byId("joingamebutton").addEventListener('click', function() { 
	let name = byId("gameCodeName").value
	let codeNum = byId("gameCodeNumber").value
	if (!name) return alert("Enter your name!!!!")
	if (!codeNum) return alert("Enter the game code!!!!")
	joinGame(codeNum, name)
}, false);

// getSongs(token, function(songList){


// })

// get top 50 songs into standard array [ {name, artist, art, mp3, id} ]
function getSongs(token, cb){
	var request = new XMLHttpRequest()
	request.open("GET", "https://api.spotify.com/v1/me/top/tracks?time_range=long_term&limit=50", true)
	request.setRequestHeader("Authorization", "Bearer " + token);
	request.onload = function() {
		if (this.status >= 200 && this.status < 400) {
			var data = JSON.parse(this.response);
			if (data && data.items && data.items.length) {
				let songReturner = []
				data.items.forEach(function(song) {
					if (song.preview_url && song.artists && song.artists[0] && song.artists[0].name && song.album && song.album.images && song.album.images[1]){
						songReturner.push({
							name: song.name,
							artist: song.artists[0].name,
							art: song.album.images[1].url,
							mp3: song.preview_url,
							id: song.id
						})
					}
					
				})
				cb(songReturner)
			} else {
				alert("sorry, we couldn't get your data!")
				location.href="/"
			}
		} else {
			alert("Could not get Spotify data")
			location.href="/"
		}
	};
	request.onerror = function() {
		alert("Could not get Spotify data");
	};
	request.send();
}