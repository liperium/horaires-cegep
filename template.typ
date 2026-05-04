// =============================================================================
// Horaire - Typst template (shared layout — do not edit)
// =============================================================================

#let render(data) = {
  // ----- Colors --------------------------------------------------------------
  let headerblue = rgb(32, 113, 182)
  let dispoBlue  = rgb(189, 215, 238)

  let palette = (
    orange: rgb(247, 148, 29),
    blue:   rgb(0, 162, 232),
    green:  rgb(76, 175, 80),
    purple: rgb(156, 89, 182),
    red:    rgb(211, 47, 47),
    pink:   rgb(233, 30, 99),
    yellow: rgb(251, 192, 45),
    teal:   rgb(0, 150, 136),
    grey:   rgb(120, 120, 120),
  )

  let resolve-color(c) = if type(c) == str { palette.at(c) } else { c }

  // ----- Unpack config -------------------------------------------------------
  let nom                = data.nom
  let titre              = data.titre
  let courriel           = data.courriel
  let contact-preference = data.contact_preference
  let courses            = data.at("courses", default: ())
  let disponibilites     = data.at("disponibilites", default: ())
  let extras             = data.at("extras", default: ())
  let premiere-heure     = data.premiere_heure
  let derniere-heure     = data.derniere_heure

  // ----- Build occupancy grid ------------------------------------------------
  let jours  = ("Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi")
  let n-rows = derniere-heure - premiere-heure

  let place-block(g, day, start, end, fill, body, text-col: white) = {
    let col = jours.position(d => d == day)
    if col == none { return g }
    let row = start - premiere-heure
    let span = end - start
    let first = g.at(row)
    first.at(col) = (kind: "block", fill: fill, body: body, span: span, text-col: text-col)
    g.at(row) = first
    for i in range(1, span) {
      let r = g.at(row + i)
      r.at(col) = (kind: "skip",)
      g.at(row + i) = r
    }
    g
  }

  let grid-cells = {
    let g = ()
    for _ in range(n-rows) { g.push((none, none, none, none, none)) }
    for course in courses {
      let color = resolve-color(course.couleur)
      for seance in course.seances {
        let day   = seance.jour
        let start = seance.debut
        let end   = seance.fin
        let group = seance.groupe
        let body = [
          #course.nom \
          (#course.local) \
          #group
        ]
        g = place-block(g, day, start, end, color, body)
      }
    }
    for dispo in disponibilites {
      let day   = dispo.jour
      let start = dispo.debut
      let end   = dispo.fin
      g = place-block(g, day, start, end, dispoBlue, [Dispo], text-col: black)
    }
    for extra in extras {
      let color    = resolve-color(extra.couleur)
      let label    = extra.label
      // light colors (yellow, dispo-blue) get black text; others get white
      let light    = (rgb(251, 192, 45), rgb(189, 215, 238))
      let text-col = if light.contains(color) { black } else { white }
      for seance in extra.seances {
        let day   = seance.jour
        let start = seance.debut
        let end   = seance.fin
        g = place-block(g, day, start, end, color, [#label], text-col: text-col)
      }
    }
    g
  }

  // ----- Cell renderers ------------------------------------------------------
  let headerCell(body) = table.cell(
    fill: headerblue,
    align: center + horizon,
    text(weight: "bold", fill: white, body),
  )

  let hourLabel(h) = table.cell(
    fill: white,
    align: center + horizon,
    text(weight: "bold")[#h h],
  )

  let empty-cell = table.cell(fill: white)[]

  let render-cell(cell) = {
    if cell == none {
      empty-cell
    } else if cell.kind == "skip" {
      none
    } else {
      table.cell(
        rowspan: cell.span,
        fill: cell.fill,
        align: center + horizon,
        text(weight: "bold", fill: cell.text-col, cell.body),
      )
    }
  }

  // ===========================================================================
  // DOCUMENT CONTENT
  // ===========================================================================
  set text(font: "Noto Sans", size: 11pt, lang: "fr")

  // HEADER
  grid(
    columns: (1fr, 1fr),
    align: (left + horizon, right + horizon),
    image("/DICJ_LOGO.png", height: 3cm),
    [
      #text(size: 26pt, weight: "bold")[#nom] \
      #v(0.2cm)
      #text(size: 15pt)[#titre]
    ],
  )

  v(0.8cm)

  // SCHEDULE TABLE
  align(center)[
    #table(
      columns: (1.2cm, 1fr, 1fr, 1fr, 1fr, 1fr),
      rows: 0.9cm,
      align: center + horizon,
      stroke: 0.6pt + black,
      headerCell[],
      ..jours.map(d => headerCell[#d]),
      ..{
        let cells = ()
        for row-idx in range(n-rows) {
          cells.push(hourLabel(premiere-heure + row-idx))
          for col-idx in range(5) {
            let c = render-cell(grid-cells.at(row-idx).at(col-idx))
            if c != none { cells.push(c) }
          }
        }
        cells
      }
    )
  ]

  v(0.8cm)

  // SESSION TITLE
  text(size: 17pt, weight: "bold", fill: headerblue)[Session #data.at("session", default: "Hiver 2026")]
  v(-0.2cm)
  line(length: 100%, stroke: 2pt + headerblue)

  v(0.5cm)

  // COURSE LIST AND CONTACT
  text(size: 12pt, weight: "bold")[Liste des cours :]

  v(0.2cm)

  {
    set list(marker: [---], indent: 1cm, body-indent: 0.5cm)
    for course in courses [
      - #text(weight: "bold", fill: resolve-color(course.couleur))[#course.code #h(1em) #course.nom]
    ]
  }

  v(0.5cm)

  grid(
    columns: (1.7fr, 1fr),
    align: (left + top, right + top),
    [
      #text(size: 12pt, weight: "bold")[Pour me rejoindre :]

      #v(0.2cm)
      #h(1em) #contact-preference

      #v(0.1cm)
      #h(1em) *Courriel :* #h(1em) #link("mailto:" + courriel)[#text(fill: headerblue)[#courriel]]
    ],
    image("/CEGEP_LOGO.png", width: 6cm),
  )
}
