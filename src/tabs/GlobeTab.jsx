import React, { useState, useRef, useEffect } from "react";
import * as THREE from "three";
import { COUNTRIES } from "../data/countries";
import { emissToHex, emissToCSS, gradeToBdg } from "../utils";
import { M, Bdg, Dot, Cd, Rw, PBar } from "../components/primitives";

function latLngToXYZ(lat, lng, r) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
    );
}

export default function GlobeTab() {
    const mountRef = useRef(null);
    const [selIdx, setSelIdx] = useState(null);
    const [view, setView] = useState("globe");

    useEffect(() => {
        const el = mountRef.current;
        if (!el) return;
        const W = el.clientWidth, H = el.clientHeight;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
        camera.position.z = 3.8;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(W, H);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        el.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0x112211, 2));
        const dLight = new THREE.DirectionalLight(0x00e87a, 0.4);
        dLight.position.set(4, 3, 4);
        scene.add(dLight);
        const pLight = new THREE.PointLight(0x003322, 1.5, 12);
        pLight.position.set(-3, 1, 2);
        scene.add(pLight);

        const group = new THREE.Group();
        scene.add(group);

        const globeGeo = new THREE.SphereGeometry(1.5, 64, 64);
        const globeMat = new THREE.MeshPhongMaterial({ color: 0x040d08, shininess: 30, specular: 0x002211 });
        group.add(new THREE.Mesh(globeGeo, globeMat));

        const atmosGeo = new THREE.SphereGeometry(1.62, 32, 32);
        const atmosMat = new THREE.MeshBasicMaterial({ color: 0x001a0a, transparent: true, opacity: 0.18, side: THREE.BackSide });
        group.add(new THREE.Mesh(atmosGeo, atmosMat));

        for (let lat = -80; lat <= 80; lat += 20) {
            const pts = [];
            for (let lng = 0; lng <= 360; lng += 3) pts.push(latLngToXYZ(lat, lng - 180, 1.502));
            const g = new THREE.BufferGeometry().setFromPoints(pts);
            group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x0a2a12, transparent: true, opacity: 0.5 })));
        }
        for (let lng = 0; lng < 360; lng += 20) {
            const pts = [];
            for (let lat = -90; lat <= 90; lat += 3) pts.push(latLngToXYZ(lat, lng - 180, 1.502));
            const g = new THREE.BufferGeometry().setFromPoints(pts);
            group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x0a2a12, transparent: true, opacity: 0.5 })));
        }

        const markerMeshes = [];
        COUNTRIES.forEach((c, i) => {
            const [, lat, lng, mt] = c;
            const pos = latLngToXYZ(lat, lng, 1.56);
            const sz = Math.max(0.022, Math.min(0.055, mt / 60000 + 0.022));
            const color = emissToHex(mt);
            const geo = new THREE.SphereGeometry(sz, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ color });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            mesh.userData = { idx: i };
            group.add(mesh);
            markerMeshes.push(mesh);

            const rGeo = new THREE.RingGeometry(sz * 1.6, sz * 2.2, 16);
            const rMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(rGeo, rMat);
            ring.position.copy(pos);
            ring.lookAt(new THREE.Vector3(0, 0, 0));
            group.add(ring);
        });

        let dragging = false, moved = 0, autoRot = true;
        let px = 0, py = 0;
        const raycaster = new THREE.Raycaster();

        const onDown = (x, y) => { dragging = true; moved = 0; px = x; py = y; autoRot = false; };
        const onMove = (x, y) => {
            if (!dragging) return;
            const dx = x - px, dy = y - py;
            moved += Math.abs(dx) + Math.abs(dy);
            group.rotation.y += dx * 0.007;
            group.rotation.x = Math.max(-1.2, Math.min(1.2, group.rotation.x + dy * 0.007));
            px = x; py = y;
        };
        const onUp = (cx, cy) => {
            if (moved < 6) {
                const rect = renderer.domElement.getBoundingClientRect();
                const mouse = new THREE.Vector2(
                    ((cx - rect.left) / rect.width) * 2 - 1,
                    -((cy - rect.top) / rect.height) * 2 + 1
                );
                raycaster.setFromCamera(mouse, camera);
                const hits = raycaster.intersectObjects(markerMeshes);
                if (hits.length > 0) setSelIdx(hits[0].object.userData.idx);
            }
            dragging = false;
            setTimeout(() => { autoRot = true; }, 4000);
        };

        const canvas = renderer.domElement;
        const mouseDown = e => onDown(e.clientX, e.clientY);
        const mouseMove = e => onMove(e.clientX, e.clientY);
        const mouseUp = e => onUp(e.clientX, e.clientY);
        const touchStart = e => { e.preventDefault(); const t = e.touches[0]; onDown(t.clientX, t.clientY); };
        const touchMove = e => { e.preventDefault(); const t = e.touches[0]; onMove(t.clientX, t.clientY); };
        const touchEnd = e => { e.preventDefault(); const t = e.changedTouches[0]; onUp(t.clientX, t.clientY); };

        canvas.addEventListener("mousedown", mouseDown);
        window.addEventListener("mousemove", mouseMove);
        window.addEventListener("mouseup", mouseUp);
        canvas.addEventListener("touchstart", touchStart, { passive: false });
        canvas.addEventListener("touchmove", touchMove, { passive: false });
        canvas.addEventListener("touchend", touchEnd, { passive: false });

        let raf;
        const animate = () => {
            raf = requestAnimationFrame(animate);
            if (autoRot && !dragging) group.rotation.y += 0.003;
            renderer.render(scene, camera);
        };
        animate();

        return () => {
            cancelAnimationFrame(raf);
            canvas.removeEventListener("mousedown", mouseDown);
            window.removeEventListener("mousemove", mouseMove);
            window.removeEventListener("mouseup", mouseUp);
            canvas.removeEventListener("touchstart", touchStart);
            canvas.removeEventListener("touchmove", touchMove);
            canvas.removeEventListener("touchend", touchEnd);
            renderer.dispose();
            if (el.contains(canvas)) el.removeChild(canvas);
        };
    }, []);

    const selCountry = selIdx !== null ? COUNTRIES[selIdx] : null;
    const [name, , , mt, offset, perCap, pop, grade, netZero, sources, dataSource] = selCountry || [];
    const gc = selCountry ? emissToCSS(mt) : "var(--jade)";
    const net = selCountry ? mt - offset : 0;
    const sortedByEmissions = [...COUNTRIES].sort((a, b) => b[3] - a[3]);

    return (
        <div>
            <div ref={mountRef} style={{ width: "100%", height: 320, background: "var(--bg)", cursor: "grab", touchAction: "none" }} />

            {/* Legend */}
            <div style={{ display: "flex", gap: 12, padding: "8px 16px", background: "var(--bg2)", borderBottom: "1px solid var(--bd)", overflowX: "auto" }}>
                {[["< 50 Mt", "#00e87a"], ["50-200", "#34d399"], ["200-500", "#f5a623"], ["500-2k", "#fb923c"], ["> 2000 Mt", "#ff4d4d"]].map(([l, c]) => (
                    <Rw key={l} style={{ gap: 5, flexShrink: 0 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: c, boxShadow: `0 0 6px ${c}` }} />
                        <M size={9} color="var(--tx3)">{l}</M>
                    </Rw>
                ))}
                <M size={9} color="var(--tx3)" style={{ marginLeft: "auto", flexShrink: 0 }}>Tap any dot</M>
            </div>

            {/* Toggle */}
            <div style={{ display: "flex", padding: "10px 16px 0" }}>
                {["globe", "ranking"].map(v => (
                    <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: "9px", background: view === v ? "var(--jg)" : "transparent", border: `1px solid ${view === v ? "rgba(0,232,122,.3)" : "var(--bd)"}`, borderRadius: 8, color: view === v ? "var(--jade)" : "var(--tx3)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "all .15s", textTransform: "capitalize" }}>
                        {v === "globe" ? "🌍 Globe Info" : "📊 Rankings"}
                    </button>
                ))}
            </div>

            <div style={{ padding: "12px 14px" }}>
                {view === "globe" && (
                    selCountry ? (
                        <div style={{ animation: "slideUp .3s ease" }}>
                            <Cd accent style={{ padding: 18, marginBottom: 14 }}>
                                <Rw style={{ justifyContent: "space-between", marginBottom: 12 }}>
                                    <div>
                                        <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 20, color: "var(--tx)", marginBottom: 4 }}>{name}</div>
                                        <Rw style={{ gap: 8 }}>
                                            <Bdg color={gradeToBdg(grade)}>{`ESG: ${grade}`}</Bdg>
                                            <Bdg color="blu">{`Net Zero: ${netZero}`}</Bdg>
                                        </Rw>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontFamily: "var(--mono)", fontSize: 28, color: gc, fontWeight: 500, lineHeight: 1 }}>{mt.toLocaleString()}</div>
                                        <M size={10} color="var(--tx3)">Mt CO₂e/yr</M>
                                    </div>
                                </Rw>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                                    {[
                                        { l: "Per Capita", v: `${perCap} t/person`, c: gc },
                                        { l: "Population", v: `${pop}M`, c: "var(--cyan)" },
                                        { l: "Forest Offset", v: `-${offset} Mt`, c: "#34d399" },
                                        { l: "NET Emissions", v: `${net.toFixed(0)} Mt`, c: net > 1000 ? "var(--red)" : "var(--amb)" },
                                    ].map(item => (
                                        <div key={item.l} style={{ padding: "10px", background: "var(--bg3)", borderRadius: 10, border: "1px solid var(--bd)" }}>
                                            <M size={9} color="var(--tx3)" style={{ display: "block", marginBottom: 3 }}>{item.l}</M>
                                            <div style={{ fontFamily: "var(--mono)", fontSize: 14, color: item.c, fontWeight: 500 }}>{item.v}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginBottom: 10 }}>
                                    <M size={9} color="var(--tx3)" style={{ display: "block", marginBottom: 5, letterSpacing: ".08em", textTransform: "uppercase" }}>Main Emission Sources</M>
                                    <p style={{ fontSize: 12, color: "var(--tx2)", lineHeight: 1.7 }}>{sources}</p>
                                </div>
                                <div style={{ padding: "8px 10px", background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--bd)" }}>
                                    <M size={9} color="var(--tx3)">Data: </M>
                                    <M size={9} color="var(--jade)">{dataSource}</M>
                                </div>
                                <div style={{ marginTop: 12 }}>
                                    <M size={9} color="var(--tx3)" style={{ display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".08em" }}>Emission Reduction Progress</M>
                                    <PBar v={grade?.startsWith("A") ? 80 : grade?.startsWith("B") ? 60 : grade?.startsWith("C") ? 35 : 15} color={gc} h={5} animate />
                                </div>
                            </Cd>
                            <Cd style={{ padding: 14 }}>
                                <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 8, letterSpacing: ".1em", textTransform: "uppercase" }}>// How CO₂ is calculated</M>
                                <p style={{ fontSize: 12, color: "var(--tx2)", lineHeight: 1.75 }}>
                                    National emissions = <span style={{ color: "var(--jade)" }}>Σ(Activity Data × Emission Factor)</span> per sector.<br />
                                    <span style={{ color: "var(--cyan)" }}>Energy</span>: fossil fuel combustion (IPCC Tier 1-3 factors).<br />
                                    <span style={{ color: "var(--amb)" }}>Agriculture</span>: enteric fermentation (CH₄×GWP28) + N₂O from soils.<br />
                                    <span style={{ color: "var(--jade)" }}>Industry</span>: process emissions (cement = 0.53 t CO₂/t clinker).<br />
                                    <span style={{ color: "#34d399" }}>Offsets</span>: LULUCF sink from forests (UNFCCC inventories).<br />
                                    Source methodology: IPCC 2006 Guidelines + AR6 GWP100.
                                </p>
                            </Cd>
                        </div>
                    ) : (
                        <Cd style={{ padding: 24, textAlign: "center" }}>
                            <div style={{ fontSize: 32, marginBottom: 10 }}>🌍</div>
                            <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16, color: "var(--tx)", marginBottom: 6 }}>Tap any country marker</div>
                            <M size={12} color="var(--tx3)">Drag to rotate · Tap dot for real CO₂ data with sources</M>
                        </Cd>
                    )
                )}

                {view === "ranking" && (
                    <div style={{ animation: "fadeUp .3s ease" }}>
                        <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 12, letterSpacing: ".1em", textTransform: "uppercase" }}>// Countries ranked by total CO₂ emissions (2023)</M>
                        {sortedByEmissions.map(([cname, , , cmt, coff, cpc, , cgrade], i) => (
                            <div key={cname} onClick={() => { setSelIdx(COUNTRIES.findIndex(c => c[0] === cname)); setView("globe"); }}
                                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 10, marginBottom: 6, cursor: "pointer", transition: "all .15s" }}>
                                <M size={13} color="var(--tx3)" style={{ width: 24, textAlign: "center", flexShrink: 0 }}>#{i + 1}</M>
                                <div style={{ width: 10, height: 10, borderRadius: "50%", background: emissToCSS(cmt), boxShadow: `0 0 8px ${emissToCSS(cmt)}`, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)", marginBottom: 2 }}>{cname}</div>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <M size={10} color="var(--tx3)">{cpc}t/person</M>
                                        <M size={10} color="#34d399">−{coff}Mt offset</M>
                                    </div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    <M size={12} color={emissToCSS(cmt)} style={{ display: "block", fontWeight: 500 }}>{cmt.toLocaleString()}Mt</M>
                                    <Bdg color={gradeToBdg(cgrade)}>{cgrade}</Bdg>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
