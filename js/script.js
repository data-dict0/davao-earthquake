async function loadData() {
    try {
        const response = await fetch('data.csv');
        const csvText = await response.text();

        const parsed = Papa.parse(csvText, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            delimitersToGuess: [',', '\t', '|', ';'],
        });

        const data = parsed.data.map((row) => {
            const cleanRow = {};
            for (let key in row) {
                cleanRow[key.trim()] = row[key];
            }
            return cleanRow;
        });

        return data;
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('loading').textContent =
            'Error loading data.csv - make sure the file is in the same directory';
        return null;
    }
}

function parseDateTime(dateTimeStr) {
    const months = {
        Jan: 0,
        Feb: 1,
        Mar: 2,
        Apr: 3,
        May: 4,
        Jun: 5,
        Jul: 6,
        Aug: 7,
        Sep: 8,
        Oct: 9,
        Nov: 10,
        Dec: 11,
    };
    const parts = dateTimeStr.match(
        /(\d+) (\w+) (\d+) - (\d+):(\d+) (AM|PM)/
    );
    if (!parts) return null;

    const day = parseInt(parts[1]);
    const month = months[parts[2].substring(0, 3)];
    const year = parseInt(parts[3]);
    let hour = parseInt(parts[4]);
    const minute = parseInt(parts[5]);
    const ampm = parts[6];

    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    return new Date(year, month, day, hour, minute);
}

async function createChart() {
    const data = await loadData();

    if (!data) return;

    // Parse dates and filter valid data
    data.forEach((d) => {
        d.date = parseDateTime(d.time);
    });

    const validData = data.filter(
        (d) => d.date !== null && !isNaN(d.date.getTime())
    );
    validData.sort((a, b) => a.date - b.date);

    document.getElementById('loading').style.display = 'none';
    document.getElementById('container').style.display = 'block';
    document.getElementById('scroll-hint').style.display = 'block';

    // Calculate time range
    const startTime = validData[0].date;
    const endTime = validData[validData.length - 1].date;
    const totalMinutes = Math.ceil((endTime - startTime) / (1000 * 60));

    document.getElementById('subtitle').textContent = `${validData.length
        } events over ${totalMinutes} minutes | ${d3.timeFormat(
            '%b %d, %I:%M %p'
        )(startTime)} - ${d3.timeFormat('%b %d, %I:%M %p')(endTime)}`;

    // Set dimensions - pixels per minute
    const pixelsPerMinute = 15; // Height for each minute
    const chartHeight = totalMinutes * pixelsPerMinute;

    // Responsive margins
    const isMobile = window.innerWidth < 768;
    const margin = {
        top: isMobile ? 100 : 150,
        right: isMobile ? 40 : 80,
        bottom: isMobile ? 40 : 50,
        left: isMobile ? 60 : 180,  // Reduced left margin on mobile to shift chart left
    };
    const width = window.innerWidth - margin.left - margin.right;

    // Set container height
    document.getElementById('chart-container').style.height =
        chartHeight + margin.top + margin.bottom + 'px';

    // Create SVG
    const svg = d3
        .select('#chart-container')
        .append('svg')
        .attr('width', window.innerWidth)
        .attr('height', chartHeight + margin.top + margin.bottom);

    const g = svg
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create time scale based on minutes
    const yScale = d3
        .scaleTime()
        .domain([startTime, endTime])
        .range([0, chartHeight]);

    const radiusScale = d3
        .scaleSqrt()
        .domain([
            d3.min(validData, (d) => d.magnitude),
            d3.max(validData, (d) => d.magnitude),
        ])
        .range(isMobile ? [10, 35] : [14, 45]);

    // Draw center line
    g.append('line')
        .attr('class', 'center-line')
        .attr('x1', width / 2)
        .attr('y1', 0)
        .attr('x2', width / 2)
        .attr('y2', chartHeight);

    // Create time ticks for every minute
    const allMinutes = [];
    let currentTime = new Date(startTime);
    while (currentTime <= endTime) {
        allMinutes.push(new Date(currentTime));
        currentTime = new Date(currentTime.getTime() + 60000);
    }

    // Draw time ticks and labels
    allMinutes.forEach((time, i) => {
        const y = yScale(time);
        const isHourMark = time.getMinutes() === 0;

        // Draw tick line
        g.append('line')
            .attr('class', isHourMark ? 'major-time-tick' : 'time-tick')
            .attr('x1', width / 2 - 20)
            .attr('y1', y)
            .attr('x2', width / 2 + 20)
            .attr('y2', y);

        // Draw label for every 5 minutes or hour marks
        if (time.getMinutes() % 5 === 0 || isHourMark) {
            g.append('text')
                .attr('class', 'time-label')
                .attr('x', width / 2 - 30)
                .attr('y', y + 4)
                .style('font-weight', isHourMark ? 'bold' : 'normal')
                .style('font-size', isHourMark ? '14px' : '12px')
                .text(
                    d3.timeFormat(isHourMark ? '%b %d, %I:%M %p' : '%I:%M')(time)
                );
        }
    });

    // ===== ANNOTATION HELPER FUNCTION =====
    function addAnnotation(startDate, endDate, text, side = 'right', options = {}) {
        const annotationY = (yScale(startDate) + yScale(endDate)) / 2;
        const fontSize = options.fontSize || (isMobile ? '12px' : '16px');
        const leftFontSize = options.leftFontSize || (isMobile ? '10px' : '14px');
        
        if (side === 'left') {
            // Left-side milestone annotations
            g.append('foreignObject')
                .attr('x', isMobile ? -margin.left + 5 : -margin.left + 500)
                .attr('y', annotationY - 40)
                .attr('width', isMobile ? margin.left - 10 : margin.left - 20)
                .attr('height', 80)
                .append('xhtml:div')
                .style('font-size', leftFontSize)
                .style('color', 'rgba(255, 255, 255, 0.4)')
                .style('line-height', '1.4')
                .style('text-align', 'right')
                .style('padding-right', isMobile ? '3px' : '10px')
                .style('padding', '8px')
                .html(text);
        } else {
            // Right-side narrative annotations
            const mobileXOffset = width / 2 + 30; // Position right after center line
            const mobileWidth = window.innerWidth - margin.left - (width / 2) - 50; // Use remaining space
            
            g.append('foreignObject')
                .attr('x', isMobile ? mobileXOffset : width - 550)
                .attr('y', annotationY - (options.offsetY || 100))
                .attr('width', isMobile ? mobileWidth : margin.right + 200)
                .attr('height', options.height || 120)
                .append('xhtml:div')
                .style('font-size', fontSize)
                .style('color', 'rgba(255, 255, 255, 0.8)')
                .style('line-height', '1.4')
                .style('text-align', 'left')
                .style('padding-left', isMobile ? '5px' : '10px')
                .style('padding-right', isMobile ? '5px' : '0px')
                .html(text);
        }
    }

    // ===== ANNOTATIONS =====
    addAnnotation(
        new Date(2025, 9, 10, 17, 14),
        new Date(2025, 9, 10, 17, 20),
        '100 aftershocks',
        'left',
    );

    addAnnotation(
        new Date(2025, 9, 10, 22, 50),
        new Date(2025, 9, 10, 22, 58),
        '200 aftershocks',
        'left'
    );

    addAnnotation(
        new Date(2025, 9, 11, 3, 20),
        new Date(2025, 9, 11, 3, 30),
        '300 aftershocks',
        'left'
    );

    addAnnotation(
        new Date(2025, 9, 10, 9, 46),
        new Date(2025, 9, 10, 9, 50),
        'The 7.4-magnitude earthquake hit off the coast of Davao Oriental at 9:43 a.m.<br><br>Aftershocks followed.',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 10, 10, 40),
        new Date(2025, 9, 10, 10, 50),
        'In just an hour, 10 aftershocks were recorded.',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 10, 11, 40),
        new Date(2025, 9, 10, 11, 50),
        'By the second hour, there were already 25 aftershocks, with one at 5.8 magnitude.',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 10, 14, 0),
        new Date(2025, 9, 10, 14, 10),
        'Aftershocks continued throughout the day.',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 10, 16, 30),
        new Date(2025, 9, 10, 16, 40),
        'As the evening approached, more aftershocks were recorded...',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 11, 0, 0),
        new Date(2025, 9, 11, 0, 20),
        'By the end of Oct. 10, <strong>229 aftershocks</strong> had been recorded, data from state volcanologists showed.',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 10, 19, 0),
        new Date(2025, 9, 10, 19, 10),
        '...and more...',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 10, 21, 0),
        new Date(2025, 9, 10, 21, 10),
        '...and more.',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 11, 2, 30),
        new Date(2025, 9, 11, 2, 40),
        'Similar to the main earthquake, most aftershocks hit offshore, although some hit land.',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 11, 3, 30),
        new Date(2025, 9, 11, 3, 40),
        'Hence, not all aftershocks are felt. There are various factors that dictate this, but some research says a magnitude of 3.0 and above are more likely to be felt.',
        'right',
        { height: 150 }
    );

    addAnnotation(
        new Date(2025, 9, 11, 6, 30),
        new Date(2025, 9, 11, 6, 40),
        'By the end of 24 hours since the main earthquake happened, 360 aftershocks had been monitored.',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 11, 10, 20),
        new Date(2025, 9, 11, 10, 50),
        'The Philippines sits on the "Pacific Ring of Fire" where earthquakes are common. Before Davao Oriental, Cebu, the country\'s largest city, was also hit by an earthquake last Sept. 30.',
        'right',
        { height: 170 }
    );

    addAnnotation(
        new Date(2025, 9, 11, 14, 26),
        new Date(2025, 9, 11, 14, 38),
        'The Cebu earthquake is also generating aftershocks to this day.',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 11, 16, 0),
        new Date(2025, 9, 11, 16, 10),
        'Aftershocks from the Davao Oriental earthquake subsided somewhat in the afternoon of Oct. 11.',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 11, 18, 20),
        new Date(2025, 9, 11, 18, 30),
        'But by the evening, they picked up again. Between 7 and 9 p.m., 30 aftershocks were recorded, government data showed, some of which were only separated by minutes.',
        'right',
        { height: 170 }
    );

    addAnnotation(
        new Date(2025, 9, 11, 16, 25),
        new Date(2025, 9, 11, 16, 30),
        '400 aftershocks',
        'left'
    );

    addAnnotation(
        new Date(2025, 9, 12, 0, 20),
        new Date(2025, 9, 12, 0, 30),
        'By the end of Oct. 11, there had been 470 aftershocks recorded.',
        'right'
    );

    addAnnotation(
        new Date(2025, 9, 12, 9, 0),
        new Date(2025, 9, 12, 9, 30),
        'Volcanologists said they have recorded over 1,500 aftershocks from the Davao Oriental earthquake to date. They said aftershocks would continue for days or even weeks.',
        'right',
        { height: 160 }
    );

    addAnnotation(
        new Date(2025, 9, 12, 2, 50),
        new Date(2025, 9, 12, 2, 55),
        '500 aftershocks',
        'left'
    );

    // TO ADD MORE ANNOTATIONS:
    // Use the helper function: addAnnotation(startDate, endDate, text, side, options)
    // 
    // Examples:
    // addAnnotation(
    //     new Date(2025, 9, 13, 14, 30),  // Start: Oct 13, 2:30 PM
    //     new Date(2025, 9, 13, 15, 0),   // End: Oct 13, 3:00 PM
    //     'Your annotation text here',
    //     'right',  // or 'left' for milestone numbers
    //     { height: 120 }  // optional: adjust height if text is longer
    // );
    //
    //
    // ===== END ANNOTATIONS =====

    // Run beeswarm simulation
    const simulation = d3
        .forceSimulation(validData)
        .force('y', d3.forceY((d) => yScale(d.date)).strength(1))
        .force('x', d3.forceX(width / 2).strength(0.1))
        .force(
            'collide',
            d3.forceCollide((d) => radiusScale(d.magnitude) + 1.5)
        )
        .stop();

    for (let i = 0; i < 300; i++) simulation.tick();

    // Create circles
    const circles = g
        .selectAll('.earthquake-circle')
        .data(validData)
        .enter()
        .append('circle')
        .attr('class', 'earthquake-circle')
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y)
        .attr('r', (d) => radiusScale(d.magnitude));

    // Add labels for magnitude 2.5 and above
    const labels = g
        .selectAll('.magnitude-label')
        .data(validData.filter((d) => d.magnitude >= 2.5))
        .enter()
        .append('text')
        .attr('class', 'magnitude-label')
        .attr('x', (d) => d.x)
        .attr('y', (d) => d.y + 5)
        .style('opacity', 0)
        .text((d) => d.magnitude);

    circles
        .attr('class', 'earthquake-circle')
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y)
        .attr('r', (d) => radiusScale(d.magnitude));

    // Scroll-based reveal
    function updateVisibility() {
        const scrollTop = window.pageYOffset;
        const windowHeight = window.innerHeight;
        const scrollCenter = scrollTop + windowHeight / 2;

        circles.each(function (d) {
            const circle = d3.select(this);
            const circleY = d.y + margin.top;

            if (circleY <= scrollCenter && !circle.classed('visible')) {
                circle.classed('visible', true);
            }
        });

        labels.each(function (d) {
            const label = d3.select(this);
            const labelY = d.y + margin.top;

            if (labelY <= scrollCenter) {
                label.style('opacity', 1);
            }
        });

        if (scrollTop > 200) {
            d3.select('#scroll-hint').style('display', 'none');
        }
    }

    window.addEventListener('scroll', updateVisibility);
    updateVisibility();
}

createChart();