# Student guide — game day

Follow this from top to bottom. It takes about ten minutes.

## Before you touch anything

1. Turn on the cameras and wait for their lights to go steady.
2. Start **OBS Studio**.
3. Start **CasparCG** (the black console window). Leave it open.
4. Start **Sports Broadcast Control**.

## Set up the show

5. Top left, check the title bar. If it says **DEMO MODE — NOT ON AIR** in
   yellow and you are doing a real broadcast, go to **Settings → Mode** and
   choose *Live production*.
6. Go to **Settings** and pick your **Venue** (for example *Lincoln High School
   Gym*) and your **Sport** (for example *Basketball*).
7. Go to **Scoreboard** and type in both team names.

## Run the checklist

8. Go to **Checklist**. Rows marked **AUTO** tick themselves when the system is
   ready — you cannot tick them by hand, and if one is not ticked, something is
   actually wrong. Tick the rest yourself as you check them. The list is
   remembered for this sport at this venue, so next week it comes back as you
   left it.
9. Do not go on air with an unticked row unless your teacher says so.

## Get the replay ready

10. Go to **Replay** and press **START BUFFER**. Do this *before* the game.
    OBS can only replay footage it has already been recording into the buffer —
    if you start it after the great play, the play is gone.

## Go on air

11. Go to **Production**.
12. Press **RECORD**. Always record, even if the stream fails.
13. Press **GO LIVE**.
14. The bar at the top turns red and shows how long you have been live.

## During the game

* **Switch cameras** — click a camera tile, or press `1` `2` `3` `4` for the
  first four. The tiles are your OBS scenes: if a shot is missing here, it is
  missing in OBS. Each tile
  shows that camera's picture, refreshed every couple of seconds, so you can see
  what you are cutting to. For full-motion pictures, use OBS Multiview on the
  second screen.
  The tile on air has a red border and says **PGM**.
* **Other shots** — the **Scenes** page shows every shot OBS has, with a picture
  of each. Click one to use it.
* **Preview before you cut** (optional) — turn on **Studio mode** at the top
  right of the camera panel. Now clicking a camera only *loads* it (green
  border, **PVW**); press the big red **TAKE** button, or `Enter`, to put it on
  air. Use this once you are comfortable — it is how a real gallery works.
* **Replay** — press `R`, or click **10 SEC** on the Production page.
  Press `S` for slow motion.
* **Back to live** — press `L`, or click the red **LIVE** button.
* **Change the score** — go to **Scoreboard** and use the big **+** buttons.
  If the scoreboard graphic is on air, it updates instantly.
* **Show the scoreboard** — Production page, **SHOW BOARD**.
* **Lower third or player intro** — go to **Graphics**, click the graphic, type
  the name, press **TAKE LIVE**. Press **CLEAR** to take it off.
* **Sponsor** — Production page, **SPONSOR**.

## If something goes wrong

The four red and orange buttons at the bottom left work from every page:

| Button | What it does |
| --- | --- |
| **SAFE SCENE** | Cuts to the safe slate immediately |
| **MUTE MIC** | Mutes the announcer microphone |
| **END GRAPHICS** | Wipes every graphic off the screen |
| **RETURN TO LIVE** | Comes out of a replay |

If a banner appears at the top of the screen, read it. It tells you exactly
what is broken. A red camera tile means that camera is offline — switch to a
different one and tell someone.

Nothing you press here can crash OBS or the graphics. Use the emergency buttons
freely.

## Another game the same day

Between fixtures of a double-header, do **not** stop the stream. Go to
**Scoreboard** and press **New game**, or **Settings → Start new game**. It:

* clears the score, period and clock back to the start
* takes any graphic off air
* un-ticks the pre-game checklist so you run it again

It keeps the team names — change them on the Scoreboard page for the new
fixture — and it leaves the stream, the recording and the replay buffer running.

## After the game

15. Press **STOP STREAM**, then confirm. It asks twice on purpose.
16. Press **STOP REC**, then confirm.
17. Press **STOP BUFFER** on the Replay page.
18. Close Sports Broadcast Control, then CasparCG, then OBS.

## If the app looks different from this guide

Your teacher may have turned on **student view**, which hides the Monitoring and
Settings pages. Everything in this guide still works. If you need the full set of
pages back, **Exit student view** is at the bottom of the left-hand menu, just
above the red emergency buttons.

## Practising

Set **Settings → Mode** to *Demo / test*. Everything works, nothing goes to air,
and you cannot break a real broadcast. The title bar stays yellow so you always
know.
