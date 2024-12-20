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

if (localStorage.getItem("currentGame") && confirm("Do you want to rejoin the game #" + localStorage.getItem("currentGame"))){

	socket.emit("confirmation", {
	  	uuid: uniqueId,
	  	code: localStorage.getItem("currentGame"),
	  })

	if (localStorage.getItem("isHost")) isHostG = true


}

socket.on("connect", () => {
  socket.emit("confirmation", {
  	uuid: uniqueId,
  	code: localStorage.getItem("currentGame")
  })
});

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

socket.on("result", function(msg){
	resultStartTime = new Date().getTime()
	function animationFrame(){
		let msPassed = new Date().getTime() - resultStartTime
		let percentageCalc = 1-(msPassed/14000)
		byId("countdownresult").style.width = percentageCalc*100 + "%"
		if (percentageCalc <= 1 ) {
			window.requestAnimationFrame(animationFrame);
		}
	}
	window.requestAnimationFrame(animationFrame);
	byId("currentRound").innerHTML = msg.round
	byId("totalRounds").innerHTML = " of " + msg.totalRounds

	byId("resultList").innerHTML = ""

	const colorThief = new ColorThief();
    const img = byId("songalbum")
    img.crossOrigin = "Anonymous";


    // Make sure image is finished loading
    if (img.complete) {
      let abc = colorThief.getColor(img);
      byId("songcard").style.backgroundColor = "rgb(" + abc.join(",") + ")"
      	      byId("countdownresult").style.backgroundColor = "rgb(" + abc.join(",") + ")"
      	      byId("overlay").style.backgroundColor = "rgb(" + abc.join(",") + ")"

      	      if ((abc[0]*0.299 + abc[1]*0.587 + abc[2]*0.114) < 186)
      	      {
      	      	byId("songtitle").style.color = "#fff"
      	      	byId("whose").style.color = "#fff"
      	      	byId("what").style.color = "#fff"
      	      	byId("by").style.color = "#fff"
      	      	byId("songartist").style.color = "#fff"

      	      }  else {
      	      	byId("songtitle").style.color = "#333"
      	      	byId("whose").style.color = "#333"
      	      	byId("what").style.color = "#333"
      	      	byId("by").style.color = "#333"
      	      	byId("songartist").style.color = "#333"
      	      }


    } else {
      img.addEventListener('load', function() {
        let abc = colorThief.getColor(img);
      byId("songcard").style.backgroundColor = "rgb(" + abc.join(",") + ")"

	       byId("countdownresult").style.backgroundColor = "rgb(" + abc.join(",") + ")"
      	      byId("overlay").style.backgroundColor = "rgb(" + abc.join(",") + ")"

      	      if ((abc[0]*0.299 + abc[1]*0.587 + abc[2]*0.114) < 186)
      	      {
      	      	byId("songtitle").style.color = "#fff"
      	      	byId("whose").style.color = "#fff"
      	      	byId("what").style.color = "#fff"
      	      	byId("by").style.color = "#fff"
      	      	byId("songartist").style.color = "#fff"

      	      }  else {
      	      	byId("songtitle").style.color = "#333"
      	      	byId("whose").style.color = "#333"
      	      	byId("what").style.color = "#333"
      	      	byId("by").style.color = "#333"
      	      	byId("songartist").style.color = "#333"
      	      }

      });
    }

    msg.scores.forEach(function(player){
    	var item = document.createElement('div');
    	item.classList.add('result')

    	byId("songtitle").innerHTML = msg.question.name
    	byId("songartist").innerHTML = msg.question.artist

    	byId("what").innerHTML = msg.question.name
    	byId("whose").innerHTML = `${msg.question.ownerName}'s #${msg.question.index+1}`
    	if (msg.question.otherIndexes){
    		msg.question.otherIndexes.forEach(function(otherIndex){
	    	byId("whose").innerHTML += `<br><span class="also">Also ${otherIndex[1]}'s #${otherIndex[0]+1}</span>`

    		})

    	}

    	byId("by").innerHTML = msg.question.artist

    	byId("songalbum").setAttribute("src", msg.question.art)

    	



    	var name1 = document.createElement('p');
    	var name2 = document.createElement('p');
    	var name3 = document.createElement('p');

    	name1.innerHTML = player.name
    	name2.innerHTML = "❌"
    	if (player.correct) name2.innerHTML = "✔️"
    	name2.innerHTML += " " + player.pick
    	name3.innerHTML = player.score.toFixed(0)

    	name1.classList.add("playerName")
    	name2.classList.add("playerAction")
    	name3.classList.add("playerScore")


    	item.appendChild(name1)
    	item.appendChild(name2)
    	item.appendChild(name3)




	    
	    
	    byId("resultList").appendChild(item);
    })
    hideEverything()
    byId("overlay").style.opacity = 1
    setTimeout(function(){
	    byId("result").classList.remove("hidden")
    byId("overlay").style.opacity = 0
    byId("doneSongs").innerHTML = byId("doneSongs").innerHTML + byId("songcard").outerHTML



    }, 5000)
})

socket.on('finish', function(msg){
	hideEverything()
	byId("alldone").classList.remove("hidden")
	localStorage.setItem("currentGame", gamecode)
	localStorage.setItem("isHost", null)

	localStorage.setItem("playlist", JSON.stringify({
		
	}))

	byId("playlistButton").setAttribute("href", byId("playlistButton").getAttribute("href")+encodeURIComponent(JSON.stringify({players:[], })))	

	byId("songcard").style.display = "none!important"
	byId("result").classList.remove("hidden")
	var divsToHide = document.getElementsByClassName("playerAction"); //divsToHide is an array
    for(var i = 0; i < divsToHide.length; i++){
        divsToHide[i].style.visibility = "hidden"; // or
        divsToHide[i].style.display = "none"; // depending on what you're doing
    }
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
			var fadeAudio = setInterval(function () {
				if (blankAudio.volume <= 0.001) {
		            clearInterval(fadeAudio);

		        }
	        
	            blankAudio.volume -= 0.1;
		       
		        
		    }, 200);
		}, 27000)
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
	    	if (!ifPickedAnswerAlready){
	    		ifPickedAnswerAlready = true
	    		console.log("picked", player.internalId, msg.owner, msg)
	    		item.style.backgroundColor = "#a6a6a6"
	    		item.style.color = "#fff"

	    		setTimeout(function(){
	    			item.style.backgroundColor = "#ef3a5d"

		    		document.querySelector(`[_player="${msg.owner}"]`).style.backgroundColor = "#169d53"
		    		document.querySelector(`[_player="${msg.owner}"]`).style.color = "#fff"
	    		}, 150)

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
		localStorage.setItem("currentGame", gamecode)
		localStorage.setItem("isHost", isHost)

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
			if (data) {
				let songReturner = []
				data.items.forEach(function(song, index) {
					if (song.preview_url && song.artists && song.artists[0] && song.artists[0].name && song.album && song.album.images && song.album.images[1] && song.id !== "4wpWZDW50CVGxQUgMmwmG"){
						songReturner.push({
							name: song.name,
							artist: song.artists[0].name,
							art: song.album.images[1].url,
							mp3: song.preview_url,
							id: song.id,
							index
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
