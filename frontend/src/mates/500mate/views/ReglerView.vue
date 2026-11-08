<template>
  <div class="max-w-2xl space-y-6">
    <h1 class="text-2xl font-bold">Regler & pointberegning</h1>
    <p class="text-sm text-stone-500">
      Denne side beskriver, hvordan 500Mate rent faktisk beregner point — det er det, appen håndhæver.
      Selve kortreglerne (giv, meldefase, kortrangering) følger jeres egne husregler.
    </p>

    <section class="panel space-y-3">
      <h2 class="section-title !mb-0">Hver runde</h2>
      <p class="text-sm">
        En runde spilles altid om <strong>10 stik</strong> i alt, uanset antal spillere. Når runden registreres i
        appen, skal de indtastede stik pr. spiller derfor summere til præcis 10.
      </p>
      <p class="text-sm">
        Én spiller kan være <strong>melder</strong> (den der har budt en kontrakt). Melderen får point efter
        kontraktens værdi, alt efter om kontrakten blev holdt. Alle andre spillere — og alle spillere, hvis ingen
        meldte — får <strong>10 point pr. stik</strong> de selv har vundet.
      </p>
    </section>

    <section class="panel space-y-3">
      <h2 class="section-title !mb-0">Kontrakt-værdier</h2>
      <table class="table">
        <thead><tr><th>Farve</th><th class="num">Basisværdi (6)</th><th class="num">Pr. niveau derover</th></tr></thead>
        <tbody>
          <tr v-for="f in [{navn:'Spar',v:40},{navn:'Klør',v:60},{navn:'Ruder',v:80},{navn:'Hjerte',v:100},{navn:'Sans',v:120}]" :key="f.navn">
            <td>{{ f.navn }}</td><td class="num">{{ f.v }}</td><td class="num">+100</td>
          </tr>
        </tbody>
      </table>
      <p class="text-sm text-stone-500">
        Fx koster 8 i hjerte: 100 + 2×100 = 300 point. Holder melderen kontrakten, får vedkommende værdien i
        point; mislykkes den, trækkes samme værdi fra.
      </p>
      <p class="text-sm">
        <strong>Grand slam:</strong> vinder melderen alle 10 stik, får vedkommende mindst 250 point — uanset
        kontraktens egen værdi, hvis den er lavere.
      </p>
      <p class="text-sm">
        <strong>Nullo:</strong> en særlig melding uden kontrakt-niveau. Vinder melderen 0 stik, får
        vedkommende +250 point; vinder melderen bare ét stik, er det −250 point.
      </p>
    </section>

    <section class="panel space-y-2">
      <h2 class="section-title !mb-0">Et spil</h2>
      <p class="text-sm">
        Et spil består af så mange runder, I ønsker. Totalen er den løbende sum af alle runders point pr. spiller.
        Når I er færdige, afslutter I spillet i appen — vinderen er den med flest point i alt på det tidspunkt.
      </p>
    </section>
  </div>
</template>
