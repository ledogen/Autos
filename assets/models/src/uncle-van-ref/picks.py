"""Landmark picks: photo -> {landmark: (u, v)} in ORIGINAL pixels, read off gridded crops.
Side suffix is the VAN's side: _L = driver (-X), _R = passenger (+X).  Centre-line points have none.

Landmarks
  hubF/hubR      hubcap centre (front/rear axle)          GS_TO/GS_BO   grille surround outer top/bottom corner
  HL_TO          upper headlamp lens, top-outer corner     HL2_BO        lower headlamp lens, bottom-outer corner
  WS_B/WS_T      windshield glass outer bottom/top corner  HOOD_FO       hood front-outer corner
  MIR_C          mirror head centre                        MK_F/MK_R     front amber / rear red side-marker centre
  WIN_RT/WIN_RB  cab door glass rear-top / rear-bottom     FUEL          fuel door centre (left side only)
  TL_TO/TL_BO    tail lamp top-outer / bottom-outer        RD_T/RD_B     rear door top-outer / bottom-outer corner
  RD_CT/RD_CB    rear doors' centre seam, top / bottom"""

SIZE = {k: (2048, 1366) for k in ("side-L-003", "side-R-009", "front-018", "rear-045",
                                  "fq-L-001", "fq-R-015", "rq-L-007", "rq-R-008")}

PICKS = {
    "front-018": {
        "TYRE_F_R": (585, 1278), "TYRE_F_L": (1505, 1280),
        "GS_TO_R": (520, 732), "GS_TO_L": (1548, 732), "GS_BO_R": (522, 922), "GS_BO_L": (1545, 922),
        "HL_TO_R": (552, 755), "HL_TO_L": (1513, 753), "HL2_BO_R": (552, 910), "HL2_BO_L": (1513, 908),
        "WS_B_R": (598, 550), "WS_B_L": (1492, 550), "WS_T_R": (648, 338), "WS_T_L": (1443, 338),
        "HOOD_FO_R": (590, 720), "HOOD_FO_L": (1475, 720), "MIR_C_R": (510, 553), "MIR_C_L": (1601, 549),
    },
    "rear-045": {
        "TYRE_R_L": (488, 1305), "TYRE_R_R": (1465, 1300),
        "TL_TO_L": (378, 732), "TL_TO_R": (1652, 740), "TL_BO_L": (378, 857), "TL_BO_R": (1652, 862),
        "RD_T_L": (533, 170), "RD_T_R": (1505, 175), "RD_B_L": (522, 1065), "RD_B_R": (1515, 1065),
        "RD_CT": (1022, 172), "RD_CB": (1022, 1065),
    },
    "fq-L-001": {
        "GS_TO_R": (122, 658), "GS_TO_L": (1022, 650), "GS_BO_R": (125, 835), "GS_BO_L": (1012, 840),
        "HL_TO_R": (155, 675), "HL_TO_L": (985, 670), "HL2_BO_R": (155, 820), "HL2_BO_L": (985, 825),
        "WS_B_R": (342, 478), "WS_B_L": (1138, 478), "WS_T_R": (475, 280), "WS_T_L": (1155, 265),
        "HOOD_FO_R": (145, 620), "HOOD_FO_L": (952, 625), "MK_F_L": (1075, 692),
        "hubF_L": (1161, 1027), "hubR_L": (1628, 995), "MK_R_L": (1735, 737), "WIN_RT_L": (1308, 295),
        "MIR_C_L": (1342, 462),
    },
    "fq-R-015": {
        "GS_TO_R": (1235, 790), "GS_TO_L": (1915, 768), "GS_BO_R": (1238, 960), "GS_BO_L": (1912, 928),
        "HL_TO_R": (1258, 807), "HL_TO_L": (1893, 785), "HL2_BO_R": (1255, 945), "HL2_BO_L": (1888, 912),
        "WS_B_R": (1048, 600), "WS_B_L": (1692, 595), "WS_T_R": (1015, 380), "WS_T_L": (1550, 385),
        "HOOD_FO_R": (1285, 762), "HOOD_FO_L": (1895, 740), "MK_F_R": (1170, 824),
        "hubF_R": (1065, 1105), "hubR_R": (340, 980), "MK_R_R": (175, 714), "WIN_RT_R": (822, 392),
        "MIR_C_R": (835, 570),
    },
    "rq-L-007": {
        "TL_TO_L": (1070, 720), "TL_TO_R": (1925, 718), "TL_BO_L": (1070, 822), "TL_BO_R": (1925, 812),
        "RD_T_L": (1138, 258), "RD_T_R": (1798, 285), "RD_B_L": (1175, 990), "RD_B_R": (1838, 975),
        "RD_CT": (1480, 272), "RD_CB": (1525, 978), "MK_R_L": (972, 772),
        "hubR_L": (780, 1080), "hubF_L": (255, 915), "WIN_RT_L": (438, 322), "WIN_RB_L": (422, 512),
        "FUEL": (927, 742), "MIR_C_L": (265, 482),
    },
    "rq-R-008": {
        "TL_TO_R": (381, 818), "TL_BO_R": (381, 918), "TL_TO_L": (106, 713), "TL_BO_L": (106, 790),
        "MK_R_R": (511, 874), "hubF_R": (1798, 920), "hubR_R": (905, 1131), "MK_F_R": (1906, 710),
        "WIN_RT_R": (1602, 422), "WIN_RB_R": (1612, 582), "MIR_C_R": (1762, 555),
    },
    "side-L-003": {
        "TYRE_F_L": (326, 1060), "TYRE_R_L": (1510, 1090), "TYRE_F_R": (None, 1003), "TYRE_R_R": (None, 1007),
        "hubF_L": (328.8, 940.5), "hubR_L": (1510, 969.5), "MK_F_L": (159, 711.5), "MK_R_L": (1846.5, 734),
        "WIN_RT_L": (695, 405), "WIN_RB_L": (695, 567), "FUEL": (1778.5, 717), "MIR_C_L": (515, 535),
    },
    "side-R-009": {
        "TYRE_F_R": (1775, 1080), "TYRE_R_R": (595, 1065),
        "hubF_R": (1776.5, 960), "hubR_R": (595.5, 942), "MK_F_R": (1962, 742), "MK_R_R": (247.5, 683),
        "WIN_RT_R": (1462, 408), "WIN_RB_R": (1462, 570), "MIR_C_R": (1640, 552),
    },
}

# rough camera positions for the solver's start (van frame: +Y nose, -X driver side, Z up)
CAM0 = {
    "side-L-003": (-12, 0, 1.2), "side-R-009": (12, 0, 1.6), "front-018": (0, 9, 1.4),
    "rear-045": (0, -8, 1.5), "fq-L-001": (-5, 8, 1.1), "fq-R-015": (6, 7, 1.5),
    "rq-L-007": (-5, -9, 1.6), "rq-R-008": (7, -6, 2.2),
}
