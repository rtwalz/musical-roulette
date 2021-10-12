let token = null
if (!location.hash) {
	location.href = "/"
} else {
	token = location.hash.split("#")[1].split("=")[1].split("&")[0]
}
if (!token) {
	location.href = "/"
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


getSongs(token, function(songList){

})

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