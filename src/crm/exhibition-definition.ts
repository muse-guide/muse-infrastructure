import { APIGatewayProxyEvent } from "aws-lambda";
import { ddbDocClient } from "../common/database-client";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { BaseException, InternalServerErrorException, NotFoundException } from "../common/exceptions";
import { responseFormatter } from "../common/response-formatter";
import { Exhibition } from "../common/model/Exhibition";

export const handler = async (event: APIGatewayProxyEvent) => {
    const id = event.pathParameters?.id;
    try {
        const exhibition = {
            id: id,
            institutionId: "1000",
            referenceName: "Moja wystawa z AWS",
            includeInstitutionInfo: true,
            qrCodeUrl: "/asset/exhibitions/1000/image/qr.png",
            images: [
                {
                    name: "img1.jpg",
                    url: "/asset/exhibitions/1000/image/img1.jpg"
                },
                {
                    name: "img2.jpg",
                    url: "/asset/exhibitions/1000/image/img2.jpg"
                },
                {
                    name: "img3.jpg",
                    url: "/asset/exhibitions/1000/image/img3.jpg"
                }
            ],
            langOptions: [
                {
                    lang: "pl",
                    title: "Galeria Sztuki Dawnej",
                    subtitle: "Europejskie i Staropolskie Rzemiosło Artystyczne, Malarstwo i Rzeźba od XV do XVIII wieku",
                    description: "Z dawnej Galerii Sztuki Zdobniczej oraz Galerii Dawnego Malarstwa Europejskiego i Staropolskiego Muzeum Narodowego powstała nowa Galeria Sztuki Dawnej. Łącząc gatunki techniczne chcemy odejść od tradycyjnego dyskursu historii sztuki, który rozdzielał „wysoką” sztukę obrazową – malarstwo, rzeźbę, rysunek i grafikę – od rzemiosła artystycznego, uznając je za dziedzinę użytkową. Tymczasem w dawnych epokach taki podział nie istniał. W zasadzie wszystkie te dziedziny sztuki traktowano równorzędnie. Jeśli już którąś wywyższano, to wcale nie malarstwo czy rzeźbę, lecz złotnictwo i produkcję tapiserii. Samo pojęcie „sztuka” – łacińska ars (a za nią włoskie, francuskie i angielskie wersje: arte, l’art, the art), grecka téchne, niemiecka i niderlandzka Kunst – oznaczało pierwotnie kunszt, sprawność wykonania, rzemiosło. Najwyżej ceniono w malarstwie i rzeźbie właśnie rzemieślniczą, wirtuozerską jakość wykonania. Obrazowy charakter malarstwa i rzeźby – poddanych zasadzie naśladowania rzeczywistości (mimesis) – też nie czyni tych gatunków osobnymi. Jak pokazuje nasza ekspozycja, znakomita większość dzieł dawnego rzemiosła artystycznego miała wprawdzie dekoracyjny charakter, ale zawierała przedstawienia figuratywne, stanowiące przecież istotę malarstwa i rzeźby. Rzemiosło artystyczne łączyły z malarstwem i rzeźbą wspólne cele i funkcje, a także przestrzenie, w jakich je gromadzono i wystawiano. I taki właśnie jest podział galerii – na „przestrzenie społeczne”: 1) pałac, willa, dwór; 2) kościół, kaplica i ołtarz domowy; 3) miasto. Innymi słowy: 1) kultura dworska, 2) kultura religijna, 3) kultura miejska."
                },
                {
                    lang: "gb",
                    title: "Gallery of Old Masters",
                    subtitle: "European and Old Polish Decorative Arts, Painting and Sculpture. 15th–18th Century",
                    description: "The former galleries: the Gallery of Decorative Arts and the Gallery of European and Polish Old Masters of the National Museum in Warsaw have been merged to form the new Gallery of Old Masters. Bringing together diverse art forms, we intend to move away from the traditional discourse of art history where the “high” pictorial art — painting, sculpture, drawing and graphic arts  were separated from decorative arts understood exclusively in utilitarian terms. Yet such division did not exist in the past. Generally speaking, all art forms were perceived as equal. If any of them was considered superior, it was not painting or sculpture but goldsmithery and tapestry weaving. The very notion of art – Latin ars (followed by Italian arte and French art), Greek techne, German and Dutch Kunst – originally signified artistry, skillful execution, craft. What was most highly esteemed in painting and sculpture was exactly artisanal expertise, virtuosity of workmanship. The representational character of painting and sculpture — subjected to the principle of the imitation of reality (mimesis) — was not a criterion of division either. As our exhibition demonstrates, the majority of examples of old artisanal handicraft, while undeniably decorative, also featured figurative depictions, which are the quintessence of painting and sculpture. Decorative arts shared with painting and sculpture their purpose and functions, but also spaces where they were collected and exhibited. These “social spaces” have provided the key to the division of the gallery: 1. palace, villa, court; 2. church, chapel and domestic altar; 3. the city. In other words: 1. court culture; 2. religious culture; 3. city culture."
                }
            ]
        }
        return responseFormatter(200, exhibition);
    } catch (err) {
        console.error("Error:", err);
        let errorResponse: BaseException = new InternalServerErrorException(err);
        if (err instanceof BaseException) errorResponse = err;

        return errorResponse.formatResponse();
    }
};