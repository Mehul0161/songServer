const express = require("express");
const path = require("path");
const app = express();
const dotenv = require('dotenv');
dotenv.config();
const cors = require("cors");
const axios = require("axios");
const http = require('https');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const cloudinary = require('cloudinary').v2;
const Replicate = require('replicate');
const cron = require('node-cron');
const crypto = require('crypto');
ffmpeg.setFfmpegPath(ffmpegPath);

// Middleware

app.use(cors()); // To allow cross-origin requests
app.use(express.json());

// Add Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Schedule cleanup task to run daily
cron.schedule('0 0 * * *', async () => {
    try {
        // Delete resources tagged for auto-deletion and older than 24 hours
        const result = await cloudinary.api.delete_resources_by_tag('auto_delete', {
            resource_type: 'video',  // Cloudinary uses 'video' type for audio files
            type: 'upload'
        });
        console.log('Cleanup completed:', result);
    } catch (error) {
        console.error('Cleanup error:', error);
    }
});

// Endpoint to generate song data based on input
app.post("/api/generate", async (req, res) => {
  const { inputText } = req.body;
  console.log(inputText);
  try {
    //  Generate Song Lyrics
    const lyrics = await generateSong(inputText);
    console.log(lyrics);

    // Find Similar Song
    const similarSong = await findSimilarSong(inputText);

    const { mp3Url } = similarSong;
    const videoUrl = `https://www.youtube.com/watch?v=${mp3Url}`;
    //convert the video to mp3
    const mp3 = await getMp3(mp3Url);
    console.log(mp3);
   //download the mp3
    const downloadedMp3 = await downloadMp3( mp3);
    

    // Fetch Another Song
    const fetchedSong = await fetchAnotherSong(lyrics, downloadedMp3);
    console.log(fetchedSong);

    //Response to Frontend
    res.json({
      lyrics,
      fetchedSong,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Something went wrong.");
  }
});

// Endpoint to fetch the song and lyrics
app.get("/api/song", (req, res) => {
  const songDetails = {
    lyrics: `Hey, music lover, it's time to play,
WriteCream's tunes will brighten your day.
With AI magic, we bring the vibe,
Endless music, for every tribe.

From workouts to gaming, or chillin' at night,
We've got the tracks to make it feel right.
Your perfect sound, built just for you,
WriteCream delivers—fresh and true.

Oh, WriteCream's here, let's break the mold,
Every beat's a story waiting to unfold.
Revolutionizing music, it's your time to shine,
Hop on the waitlist, the future's divine.

Focus, relax, or fuel your grind,
WriteCream's tunes are one of a kind.
We're just getting started, so come explore,
AI-powered sound, and so much more.

From day to night, and everything between,
WriteCream's got your ultimate music scene.
A world of beats, at your command,
Join the journey—take a stand!

Oh, WriteCream's here, let's break the mold,
Every beat's a story waiting to unfold.
Revolutionizing music, it's your time to shine,
Hop on the waitlist, the future's divine.

AI-driven, designed for you,
WriteCream's magic brings something new.
Unleash your world with every tune,
Step into the rhythm, we're launching soon!

So don't wait now, it's time to create,
With WriteCream, the music's great.
Be part of the magic, we're just getting done,
Your music revolution has begun!`,

    audioUrl: `${req.protocol}://${req.get("host")}/static/song.mp3`,
  };

  res.json(songDetails);
});


app.use("/static", express.static(path.join(__dirname, "static")));
const PORT = 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));



// Generate Song Lyrics
async function generateSong(keyword) {
  try {
    const response = await open_ai_chat({
      model: "accounts/fireworks/models/deepseek-v3",
      temperature: 1,
      n: 1,
      max_tokens: 1000,
      stop: ["Topic:", "Response:"],
      messages: [
        {
          role: "system",
          content: "Only return lyrics in the response nothing else not even the istruction or comment.",
        },

        {
          role: "user",
          content: `Suggest lyrics for a song based on the following keyword: ${keyword}`,
        },
      ],
    });
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("Error generating song:", error);
    throw error;
  }
}

// Find Similar Song
async function findSimilarSong(inputText) {
    const randomIndex = Math.floor(Math.random() * 10);
  const query = "find a song that " + inputText ;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=10&key=${YOUTUBE_API_KEY}`);
    if (!response.ok) throw new Error('YouTube API request failed');

    const data = await response.json();
    const videoId = data.items[randomIndex].id.videoId;


    return { mp3Url: videoId };

} catch (error) {
    console.error('Error fetching YouTube videos:', error);
    return [];
}
}




async function getMp3(mp3Url) {
  const options = {
    method: 'GET',
    hostname: 'youtube-mp36.p.rapidapi.com',
    port: null,
    path: `/dl?id=${mp3Url}`,
    headers: {
      'x-rapidapi-key': 'b3f0baed62mshbd8f43ea4deeba2p165e0cjsn417b233ec6f5',
      'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com'
    }

  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, function (res) {
      const chunks = [];
    
      res.on('data', function (chunk) {
        chunks.push(chunk);
      });
    
      res.on('end', function () {
        const body = Buffer.concat(chunks).toString();
        try {
          const jsonResponse = JSON.parse(body);

          resolve(jsonResponse.link);

          return jsonResponse.link;

        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.end();
  });
}


// Fetch Another Song
async function fetchAnotherSong(lyrics, downloadedMp3) {
    try {
        // Generate a unique song ID
        const songId = generateSongId();
        
        // Upload original song to Cloudinary
        const cloudinaryUrl = await uploadToCloudinary(downloadedMp3);
        console.log("Uploaded original to Cloudinary:", cloudinaryUrl);

        // Initialize Replicate
        const replicate = new Replicate({
            auth: process.env.REPLICATE_API_TOKEN,
        });

        // Call Replicate API
        const outputStream = await replicate.run(
            "minimax/music-01:a05a52e0512dc0942a782ba75429de791b46a567581f358f4c0c5623d5ff7242",
            {
                input: {
                    lyrics: lyrics,
                    song_file: cloudinaryUrl,
                    bitrate: 256000,
                    sample_rate: 44100,
                }
            }
        );

        // Convert binary data to Buffer
        const chunks = [];
        for await (const chunk of outputStream) {
            if (typeof chunk === 'object') {
                const uint8Array = new Uint8Array(Object.values(chunk));
                chunks.push(Buffer.from(uint8Array));
            } else {
                chunks.push(Buffer.from(chunk));
            }
        }
        
        const outputBuffer = Buffer.concat(chunks);

        // Upload generated song buffer to Cloudinary
        const tempOutputPath = path.join(__dirname, 'static', `temp_output_${songId}.mp3`);
        await fs.promises.writeFile(tempOutputPath, outputBuffer);
        
        const result = await cloudinary.uploader.upload(tempOutputPath, {
            resource_type: 'auto',
            public_id: `song_${songId}`,
            type: 'upload',
            access_mode: 'public',
            tags: ['auto_delete'],
            invalidate: true,
            transformation: [
                {duration: "24h"}
            ]
        });

        // Clean up temp files
        fs.unlink(tempOutputPath, (err) => {
            if (err) console.error("Error deleting temp output file:", err);
        });
        fs.unlink(downloadedMp3, (err) => {
            if (err) console.error("Error deleting the MP3 file:", err);
        });

        // Format the output as JSON
        const formattedOutput = {
            status: 'success',
            data: {
                songId: songId,
                generatedAudio: result.secure_url,
                originalAudio: cloudinaryUrl,
                timestamp: new Date().toISOString()
            }
        };

        console.log("Formatted Output:", JSON.stringify(formattedOutput, null, 2));
        return formattedOutput;

    } catch (error) {
        console.error("Error in fetchAnotherSong:", error);
        return {
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Fix the uploadToCloudinary function
async function uploadToCloudinary(filePath) {
    try {
        // Read the file first
        const fileData = await fs.promises.readFile(filePath);
        
        const result = await cloudinary.uploader.upload(filePath, {
            resource_type: 'auto',
            public_id: `generated_${Date.now()}`,
            type: 'upload',
            access_mode: 'public',
            tags: ['auto_delete'],
            invalidate: true,
            transformation: [
                {duration: "24h"}
            ]
        });
        return result.secure_url;
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw error;
    }
}

const headers = {
  "Content-Type": "application/json",
  Authorization: "Bearer fw_3Zf8JVu43bKrmzu9n6ykF2Bw",
};

async function open_ai_chat(params) {
  if (params.stop && params.stop.indexOf("<|eot_id|>") === -1) {
    params.stop.push("<|eot_id|>");
  } else {
    params.stop = ["<|eot_id|>"];
  }

  if (!params.max_tokens) {
    params.max_tokens = 2500;
  }

  const dataString = JSON.stringify(params);

  const options = {
    url: "https://api.fireworks.ai/inference/v1/chat/completions",
    method: "POST",
    headers: headers,
    data: dataString,
  };

  try {
    const response = await axios(options);
    return { data: response.data };
  } catch (error) {
    console.error("Error in API call:", error);
    throw error;
  }
}
 



module.exports = { generateSong, findSimilarSong }

async function downloadMp3(mp3) {
  console.log("Downloading MP3 from URL:", mp3);

  try {
    const tempFilePath = path.join(__dirname, "static", "temp_song.mp3");
    const outputFilePath = path.join(__dirname, "static", "downloaded_song.mp3");

    // First download the file
    const writer = fs.createWriteStream(tempFilePath);
    const response = await axios({
      url: mp3,
      method: "GET",
      responseType: "stream",
    });

    response.data.pipe(writer);

    // Wait for download to complete
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    // Now trim the file to 59 seconds using ffmpeg
    return new Promise((resolve, reject) => {
      ffmpeg(tempFilePath)
        .setStartTime(0)
        .setDuration(59)
        .output(outputFilePath)
        .on('end', () => {
          // Delete the temporary file
          fs.unlink(tempFilePath, (err) => {
            if (err) console.error("Error deleting temp file:", err);
          });
          console.log("Song trimmed and saved at:", outputFilePath);
          resolve(outputFilePath);
        })
        .on('error', (err) => {
          console.error("Error trimming file:", err);
          reject(err);
        })
        .run();
    });

  } catch (error) {
    console.error("Error processing the MP3 file:", error);
    throw error;
  }
}

// Add this function to generate a unique song ID
function generateSongId() {
    return crypto.randomBytes(8).toString('hex');
}

// Add new endpoint to fetch song by ID
app.get("/api/song/:songId", async (req, res) => {
    try {
        const { songId } = req.params;
        
        // Search for the song in Cloudinary by public_id
        const result = await cloudinary.search
            .expression(`public_id:song_${songId}`)
            .execute();

        if (result.resources.length > 0) {
            res.json({
                status: 'success',
                data: {
                    songId: songId,
                    audioUrl: result.resources[0].secure_url
                }
            });
        } else {
            res.status(404).json({
                status: 'error',
                error: 'Song not found or expired'
            });
        }
    } catch (error) {
        console.error("Error fetching song:", error);
        res.status(500).json({
            status: 'error',
            error: 'Failed to fetch song'
        });
    }
});
