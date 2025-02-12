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
const ffprobePath = require('ffprobe-static').path;
const cloudinary = require('cloudinary').v2;
const Replicate = require('replicate');
const cron = require('node-cron');

// Set paths for both ffmpeg and ffprobe
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

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
    try {
        const lyrics = await generateSong(inputText);

        let downloadedMp3;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                const similarSong = await findSimilarSong(inputText);
                console.log("Found similar song URL:", similarSong.mp3Url);

                const mp3 = await getMp3(similarSong.mp3Url);
                downloadedMp3 = await downloadMp3(mp3, inputText);
                console.log("Original song URL:", downloadedMp3);
                break;
            } catch (error) {
                attempts++;
                if (attempts === maxAttempts) {
                    throw new Error('Failed to find a suitable song after multiple attempts');
                }
            }
        }

        const fetchedSong = await fetchAnotherSong(lyrics, downloadedMp3);

        res.json({
            status: 'success',
            lyrics,
            originalSong: downloadedMp3,
            generatedSong: fetchedSong.data.generatedAudio,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
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
    console.log("Converting video ID to MP3:", mp3Url);
    
    const options = {
        method: 'GET',
        hostname: 'youtube-mp36.p.rapidapi.com',
        port: null,
        path: `/dl?id=${mp3Url}`,
        headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,  // Use environment variable
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
                try {
                    const body = Buffer.concat(chunks).toString();
                    const jsonResponse = JSON.parse(body);

                    // Check for API specific error responses
                    if (jsonResponse.status === 'fail') {
                        throw new Error(`API Error: ${jsonResponse.msg}`);
                    }

                    if (!jsonResponse.link) {
                        throw new Error(`No MP3 link in response: ${body}`);
                    }

                    console.log("Got MP3 URL:", jsonResponse.link);
                    resolve(jsonResponse.link);
                } catch (err) {
                    reject(new Error(`Failed to parse response: ${err.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Request failed: ${error.message}`));
        });

        req.end();
    });
}

// Modify fetchAnotherSong to include response logging
async function fetchAnotherSong(lyrics, downloadedMp3Url) {
    try {
        const replicate = new Replicate({
            auth: process.env.REPLICATE_API_TOKEN,
        });

        console.log('Processing song with Minimax...');
        console.log('Input:', {
            lyrics: lyrics.substring(0, 100) + '...', // Log first 100 chars of lyrics
            song_file: downloadedMp3Url
        });
        
        const outputStream = await replicate.run(
            "minimax/music-01:a05a52e0512dc0942a782ba75429de791b46a567581f358f4c0c5623d5ff7242",
            {
                input: {
                    lyrics: lyrics,
                    song_file: downloadedMp3Url,
                    bitrate: 256000,
                    sample_rate: 44100,
                    temperature: 0.8
                }
            }
        );

        const audioBuffers = [];
        for await (const chunk of outputStream) {
            if (typeof chunk === 'object') {
                const uint8Array = new Uint8Array(Object.values(chunk));
                audioBuffers.push(Buffer.from(uint8Array));
            } else {
                audioBuffers.push(Buffer.from(chunk));
            }
        }
        
        const audioBuffer = Buffer.concat(audioBuffers);
        const generatedUrl = await uploadBufferToCloudinary(audioBuffer, 'generated');

        console.log('Minimax Processing Complete:', {
            generatedUrl,
            bufferSize: `${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB`
        });

        return {
            status: 'success',
            data: {
                generatedAudio: generatedUrl,
                originalAudio: downloadedMp3Url,
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        console.error("Error in fetchAnotherSong:", error);
        return {
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Modify uploadBufferToCloudinary to accept a name prefix
async function uploadBufferToCloudinary(buffer, namePrefix = 'generated') {
    try {
        const base64Data = buffer.toString('base64');
        
        const result = await cloudinary.uploader.upload(
            `data:audio/mp3;base64,${base64Data}`, 
            {
                resource_type: 'auto',
                public_id: `${namePrefix}_${Date.now()}`,
                type: 'upload',
                access_mode: 'public',
                tags: ['auto_delete'],
                invalidate: true,
                transformation: [
                    {duration: "24h"}
                ]
            }
        );
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

// Add this helper function to check file size (in MB)
function getFileSizeInMB(buffer) {
    return buffer.length / (1024 * 1024);
}

// Modify downloadMp3 to include size check
async function downloadMp3(mp3Url, inputText, maxRetries = 3) {
    console.log("Downloading MP3 from URL:", mp3Url);

    try {
        const response = await axios({
            url: mp3Url,
            method: "GET",
            responseType: "arraybuffer",
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const fileSizeInMB = getFileSizeInMB(response.data);
        console.log(`File size: ${fileSizeInMB.toFixed(2)} MB`);

        if (fileSizeInMB < 2.5 || fileSizeInMB > 10) {
            throw new Error(`File size ${fileSizeInMB.toFixed(2)}MB is outside allowed range (2.5MB-10MB)`);
        }

        // Rest of the upload code...
        const base64Data = Buffer.from(response.data).toString('base64');
        const cloudinaryResult = await cloudinary.uploader.upload(
            `data:audio/mp3;base64,${base64Data}`,
            {
                resource_type: 'auto',
                public_id: `temp_${Date.now()}`,
                type: 'upload',
                access_mode: 'public',
                tags: ['temp_file']
            }
        );

        return cloudinaryResult.secure_url;

    } catch (error) {
        console.error("Download/Upload error:", error);
        if (maxRetries > 0) {
            console.log(`Retrying with different song. Retries left: ${maxRetries - 1}`);
            const newSong = await findSimilarSong(inputText);
            const newMp3 = await getMp3(newSong.mp3Url);
            return downloadMp3(newMp3, inputText, maxRetries - 1);
        }
        throw error;
    }
}