#set page(paper: "us-letter", margin: (x: 1.5cm, top: 1cm, bottom: 1cm))

#let data = toml("config.toml")
#import "/template.typ": render
#render(data)
