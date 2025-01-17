const express = require('express');
const path = require('path');
const app = express();
const cors = require('cors');

// Middleware
app.use(cors()); // To allow cross-origin requests
app.use(express.json());

// Endpoint to generate song data based on input
app.post('/api/generate', (req, res) => {
        const { inputText } = req.body;

    
        // Process inputText and generate appropriate data
        const generatedLyrics = `You said: "${inputText}" - here's your custom melody:
    Hey, the vibe is here, just like you say,
    We'll make the moment brighter today!`;
    
        const audioUrl = `${req.protocol}://${req.get('host')}/static/song2.mp3`; 
    
        res.json({
            lyrics: generatedLyrics,
            audioUrl: audioUrl,
        });
    });


// Endpoint to fetch the song and lyrics
app.get('/api/song', (req, res) => {
  const songDetails = {
    lyrics: `Hey, music lover, it’s time to play,
WriteCream’s tunes will brighten your day.
With AI magic, we bring the vibe,
Endless music, for every tribe.

From workouts to gaming, or chillin' at night,
We’ve got the tracks to make it feel right.
Your perfect sound, built just for you,
WriteCream delivers—fresh and true.

Oh, WriteCream’s here, let’s break the mold,
Every beat’s a story waiting to unfold.
Revolutionizing music, it’s your time to shine,
Hop on the waitlist, the future’s divine.

Focus, relax, or fuel your grind,
WriteCream’s tunes are one of a kind.
We’re just getting started, so come explore,
AI-powered sound, and so much more.

From day to night, and everything between,
WriteCream’s got your ultimate music scene.
A world of beats, at your command,
Join the journey—take a stand!

Oh, WriteCream’s here, let’s break the mold,
Every beat’s a story waiting to unfold.
Revolutionizing music, it’s your time to shine,
Hop on the waitlist, the future’s divine.

AI-driven, designed for you,
WriteCream’s magic brings something new.
Unleash your world with every tune,
Step into the rhythm, we’re launching soon!

So don’t wait now, it’s time to create,
With WriteCream, the music’s great.
Be part of the magic, we’re just getting done,
Your music revolution has begun!`,

    audioUrl: `${req.protocol}://${req.get('host')}/static/song.mp3`,
  };

  res.json(songDetails);
});

// Serve the audio file
app.use('/static', express.static(path.join(__dirname, 'static')));

// Start the server
const PORT = 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
