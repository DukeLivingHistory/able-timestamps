require('es6-promise').polyfill()

/**
 * Takes a timestamp formatted hh:mm:ss:MMM or mm:ss:MMM and returns value in seconds
 * @param  {string} timestamp Timestamp
 * @return {number}           Value in seconds
 *
 */
const convertTimeStampToSeconds = (timestamp) => {
  const reversed = timestamp.split('').reverse().join('')
  const regexp   = /(\d\d\d)\.(\d\d)\:(\d\d)(?::(\d\d))?/
  const matches  = reversed.match(regexp)

  if(!matches || matches.length < 3) throw new Error(`Badly formatted timestamp: ${timestamp}`)

  const s = matches[2].split('').reverse().join('')
  const m = matches[3].split('').reverse().join('')
  const h = matches[4] ? matches[4].split('').reverse().join('') : 0

  return parseInt(s) + (parseInt(m) * 60) + (parseInt(h) * 60 * 60)
}

/**
 * Converts a transcript using chapter titles to an array of objects representing information
 * about individual timestamps.
 *
 * ex.
 * Chapter 1
 * 00:00:00.000 --> 00:00:01.000
 * Arbitrary Chapter Text
 *
 * would return
 * [{
 *  text: 'Chapter 1',
 *  start: 0,
 *  end: 1
 *  percentage: 0
 * }]
 *
 * @param  {string} transcript WebVTT transcript
 * @return {array}             Array of objects with properties: start, end, text, percentage
 *
 */
const titlesToTimestamps = (transcript = '') => {
  const regexp     = /(.*)\n((?:\d\d)?:\d\d:\d\d.\d\d\d) \-\-\> ((?:\d\d)?:\d\d:\d\d.\d\d\d)/g
  const matches    = transcript.match(regexp)
  const timestamps = []

  if(!matches.length) throw new Error(`Transcript does not contain properly formatted chapters`)

  matches.map(match => {
    const subregexp = /(.*)\n((?:\d\d)?:\d\d:\d\d.\d\d\d) \-\-\> ((?:\d\d)?:\d\d:\d\d.\d\d\d)/
    const submatches = match.match(subregexp)

    const text  = submatches[1]
    const start = convertTimeStampToSeconds(submatches[2])
    const end   = convertTimeStampToSeconds(submatches[3])

    timestamps.push({ text, start, end })
  })

  return timestamps
}

/**
 * Converts an external chapter file to an array of objects representing information
 * about individual timestamps.
 *
 * Chapter 1
 * 00:00:00.000 --> 00:00:01.000
 * Chapter 1
 *
 * would return
 * [{
 *  text: 'Chapter 1',
 *  start: 0,
 *  end: 1
 *  percentage: 0
 * }]
 *
 * @param  {string} transcript WebVTT transcript
 * @return {array}             Array of objects with properties: start, end, text, percentage
 *
 */
const chaptersToTimestamps = (transcript = '') => {
  const regexp     = /(?:\d\d)?:\d\d:\d\d.\d\d\d \-\-\> (?:\d\d)?:\d\d:\d\d.\d\d\d\n(?:.*)/g
  const matches    = transcript.match(regexp)
  const timestamps = []

  if(!matches) throw new Error(`Transcript does not contain properly formatted chapters`)

  matches.map(match => {
    const subregexp = /((?:\d\d)?:\d\d:\d\d.\d\d\d) \-\-\> ((?:\d\d)?:\d\d:\d\d.\d\d\d)\n(.*)/
    const submatches = match.match(subregexp)

    const text  = submatches[3]
    const start = convertTimeStampToSeconds(submatches[1])
    const end   = convertTimeStampToSeconds(submatches[2])

    timestamps.push({ text, start, end })

  })

  return timestamps
}

/**
 * Wraps the instantiation of an AblePlayer object to provide an interface for triggering
 * an arbitrary callback upon successful initialization of the AblePlayer object.
 *
 * Returns a promise with the AblePlayer instance as the sole argument OR an error code.
 *
 * Can accept either a string or an AblePlayer instance as an argument.
 * If a string is provided, it will be used as a selector for initializing AblePlayer.
 * If an AblePlayer instance is provided, it will be re-used.
 *
 * Must be called after both jQuery and AblePlayer itself are loaded.
 *
 * @param  {string|AblePlayer}   player Selector to be used in creating AblePlayer object OR pre-existing AblePlayer instance.
 * @return {Promise}
 */
const ableplayerPlugin = (player) => {
  return new Promise((resolve, reject) => {
    if(typeof AblePlayer === 'undefined'){
      reject('Load AblePlayer script before declaring plugins.')
    }

    if(typeof $ === 'undefined'){
      reject('Load jQuery before declaring plugins.')
    }

    const AP = (typeof player === 'object') ?
      player :
      new AblePlayer($(player))

    const timeout = setTimeout(() => {
      reject('Player did not instantialize')
    }, 10000)

    const checkForInitialization = setInterval(() => {
      if(typeof AP.initializing === 'undefined') return
      clearInterval(checkForInitialization)
      resolve(AP)
    }, 100)
  })
}

/**
 * Creates an AblePlayer instance with indicator dots on the seekbar for chapter headings.
 * Chapters can either be seperate chapter files, or titles included in a transcript.
 * They must be provided as a string, so if you're using external files, this should
 * be called as a callback of an AJAX function to request the contents of that file.
 *
 * Return a promise with the AblePlayer instance as the sole argument OR an error code.
 *
 * Can accept either a string or an AblePlayer instance as an argument.
 * If a string is provided, it will be used as a selector for initializing AblePlayer.
 * If an AblePlayer instance is provided, it will be re-used.
 *
 * Must be called after both jQuery and AblePlayer itself are loaded.
 *
 * @param  {string|AblePlayer} player      Selector to be used in creating AblePlayer object OR pre-existing AblePlayer instance.
 * @param  {string}            transcript  Full VTT contents to be parsed and used as chapters.
 * @param  {Object}            opts        Options object.
 * @return {Promise}
 */
window.ableplayerAddDots = (player, transcript, opts = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const defaultOpts = {
        dotColor: '#ffffff',
        dotSize: 6
      }

      const mergedOpts = Object.assign({}, defaultOpts, opts)

      ableplayerPlugin(player).then(player => {
        let chapters
        switch(mergedOpts.format) {
          case 'array':
            chapters = transcript
            break
          case 'titles':
            chapters = titlesToTimestamps(transcript)
            break
          default:
            chapters = chaptersToTimestamps(transcript)
            break
        }

        const duration = player.media.duration

        const $player = player.$ableDiv
        const $bar = $player.find('.able-seekbar')

        chapters.map(chapter => {
          const { text, start, end, percentage } = chapter
          const { dotSize, dotColor } = mergedOpts

          const $dot = $(`<div tabindex="0" class="able-indicator" aria-label="Jump to chapter: ${text}"</div>`)

          $dot.on('click keydown', () => {
            player.seekTo(start)
            player.playMedia()
          }).css({
            position:     'absolute',
            top:          '50%',
            marginTop:    dotSize / -2 + 'px',
            marginLeft:   dotSize / -2 + 'px',
            left:         (start / duration * 100) + '%',
            width:        dotSize + 'px',
            height:       dotSize + 'px',
            borderRadius: '100%',
            background:   dotColor,
            zIndex:       10000
          })

          $bar.append($dot)
        })

        resolve(player)
      })
    } catch(e) {
      reject(e)
    }
  })
}
