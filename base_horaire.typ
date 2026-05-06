// =============================================================================
// Horaire - Typst template
// =============================================================================
// Place DICJ_LOGO.png and CEGEP_LOGO.png in the same folder as this file.
// Compile with: typst compile horaire_template.typ
// =============================================================================


// #############################################################################
// #                                                                           #
// #                    ▼▼▼  EDIT THIS SECTION ONLY  ▼▼▼                       #
// #                                                                           #
// #############################################################################

// ----- Personal info ---------------------------------------------------------
#let nom      = "Mattys Gervais"
#let titre    = "Enseignant"
#let session  = "Session Hiver 2026"
#let courriel = "MattysGervais@cegepjonquiere.ca"
#let contact-preference = [Préférablement *par Teams*]

// ----- Courses (up to 4) -----------------------------------------------------
// Each course has: code, nom, local, couleur, and a list of seances.
// Couleur options: "orange", "blue", "green", "purple"
//
// Each seance places the course on the grid: (day, start, end, group)
//   day:   "Lundi" | "Mardi" | "Mercredi" | "Jeudi" | "Vendredi"
//   start: starting hour, integer (e.g. 8 means 8h)
//   end:   ending hour,   integer (e.g. 12 means 12h)
//   group: label shown on the block (e.g. "Gr.10")
//
// To use fewer than 4 courses, just remove entries from the list.

#let courses = (
  (
    code: "420-KUA-JQ",
    nom: "Programmation avancé",
    local: "331.1",
    couleur: "orange",
    seances: (
      ("Jeudi",    8, 12, "Gr.20"),
      ("Vendredi", 8, 12, "Gr.10"),
    ),
  ),
  (
    code: "420-ZQA-JQ",
    nom: "Gestion de fichiers",
    local: "716.1",
    couleur: "blue",
    seances: (
      ("Lundi", 13, 17, "Gr.20"),
      ("Mardi", 13, 17, "Gr.10"),
    ),
  ),
)

// ----- Availability ("Disponible") blocks -----------------------------------------
// Format: (day, start, end)
#let disponibilites = (
  ("Mardi",  8, 12),
  ("Jeudi", 13, 17),
)

// ----- Grid range ------------------------------------------------------------
#let premiere-heure = 8    // first hour label on the grid
#let derniere-heure = 17   // grid ends here (last hour label is this - 1)

// #############################################################################
// #                                                                           #
// #                    ▲▲▲  END OF EDITABLE SECTION  ▲▲▲                      #
// #                                                                           #
// #           (you shouldn't need to modify anything below this line)         #
// #                                                                           #
// #############################################################################


// ----- Page setup ------------------------------------------------------------
#set page(
  paper: "us-letter",
  margin: (x: 1.5cm, top: 1cm, bottom: 1cm),
)
#set text(font: "Noto Sans", size: 11pt, lang: "fr")

// ----- Colors ----------------------------------------------------------------
#let headerblue     = rgb(32, 113, 182)
#let dispoBlue      = rgb(189, 215, 238)

#let palette = (
  orange: rgb(247, 148, 29),
  blue:   rgb(0, 162, 232),
  green:  rgb(76, 175, 80),
  purple: rgb(156, 89, 182),
)

#let resolve-color(c) = if type(c) == str { palette.at(c) } else { c }

// ----- Build occupancy grid --------------------------------------------------
#let jours = ("Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi")
#let n-rows = derniere-heure - premiere-heure

#let place-block(g, day, start, end, fill, body) = {
  let col = jours.position(d => d == day)
  if col == none { return g }
  let row = start - premiere-heure
  let span = end - start
  let first = g.at(row)
  first.at(col) = (kind: "block", fill: fill, body: body, span: span)
  g.at(row) = first
  for i in range(1, span) {
    let r = g.at(row + i)
    r.at(col) = (kind: "skip",)
    g.at(row + i) = r
  }
  g
}

#let grid-cells = {
  let g = ()
  for _ in range(n-rows) { g.push((none, none, none, none, none)) }
  for course in courses {
    let color = resolve-color(course.couleur)
    for seance in course.seances {
      let (day, start, end, group) = seance
      let body = [
        #course.nom \
        (#course.local) \
        #group
      ]
      g = place-block(g, day, start, end, color, body)
    }
  }
  for dispo in disponibilites {
    let (day, start, end) = dispo
    g = place-block(g, day, start, end, dispoBlue, [Disponible])
  }
  g
}

// ----- Cell renderers --------------------------------------------------------
#let headerCell(body) = table.cell(
  fill: headerblue,
  align: center + horizon,
  text(weight: "bold", fill: white, body),
)

#let hourLabel(h) = table.cell(
  fill: white,
  align: center + horizon,
  text(weight: "bold")[#h h],
)

#let empty-cell = table.cell(fill: white)[]

#let render-cell(cell) = {
  if cell == none {
    empty-cell
  } else if cell.kind == "skip" {
    none
  } else {
    let is-dispo = cell.fill == dispoBlue
    let text-color = if is-dispo { black } else { white }
    table.cell(
      rowspan: cell.span,
      fill: cell.fill,
      align: center + horizon,
      text(weight: "bold", fill: text-color, cell.body),
    )
  }
}

// =============================================================================
// HEADER
// =============================================================================
#grid(
  columns: (1fr, 1fr),
  align: (left + horizon, right + horizon),
  image("DICJ_LOGO.png", height: 3cm),
  [
    #text(size: 26pt, weight: "bold")[#nom] \
    #v(0.2cm)
    #text(size: 15pt)[#titre]
  ],
)

#v(0.8cm)

// =============================================================================
// SCHEDULE TABLE
// =============================================================================
#align(center)[
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

#v(0.8cm)

// =============================================================================
// SESSION TITLE
// =============================================================================
#text(size: 17pt, weight: "bold", fill: headerblue)[#session]
#v(-0.2cm)
#line(length: 100%, stroke: 2pt + headerblue)

#v(0.5cm)

// =============================================================================
// COURSE LIST AND CONTACT
// =============================================================================
#text(size: 12pt, weight: "bold")[Liste des cours :]

#v(0.2cm)

#set list(marker: [---], indent: 1cm, body-indent: 0.5cm)
#for course in courses [
  - #text(weight: "bold", fill: resolve-color(course.couleur))[#course.code #h(1em) #course.nom]
]

#v(0.5cm)

#grid(
  columns: (1.7fr, 1fr),
  align: (left + top, right + top),
  [
    #text(size: 12pt, weight: "bold")[Pour me rejoindre :]

    #v(0.2cm)
    #h(1em) #contact-preference

    #v(0.1cm)
    #h(1em) *Courriel :* #h(1em) #link("mailto:" + courriel)[#text(fill: headerblue)[#courriel]]
  ],
  image("CEGEP_LOGO.png", width: 6cm),
)

